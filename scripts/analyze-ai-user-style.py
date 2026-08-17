#!/usr/bin/env python3
"""Analyze the user's own language in local Codex and Claude histories.

The script intentionally excludes Claude pasted-text payloads from style analysis:
those payloads may be source material written by somebody else. It keeps the text
the user typed around the paste placeholder.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


HAN_RE = re.compile(r"[\u3400-\u9fff]")
HAN_RUN_RE = re.compile(r"[\u3400-\u9fff]{2,}")
ENGLISH_RE = re.compile(r"[A-Za-z][A-Za-z0-9_.+-]*")
PASTE_PLACEHOLDER_RE = re.compile(r"\[Pasted [^\]\r\n]+\]")
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
WINDOWS_PATH_RE = re.compile(r"(?:[A-Za-z]:\\|\\\\)[^\s]+")
UNIX_PATH_RE = re.compile(r"(?<!\w)/(?:[^\s/]+/)*[^\s/]*")
SENSITIVE_RE = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]+|password\s*[:=]|secret\s*[:=])",
    re.IGNORECASE,
)

PHRASES = [
    "我觉得",
    "我认为",
    "我想",
    "我更",
    "我还是",
    "我突然觉得",
    "其实",
    "其实我",
    "感觉",
    "为什么",
    "怎么",
    "是不是",
    "能不能",
    "可以",
    "需要",
    "应该",
    "不应该",
    "不要",
    "不用",
    "直接",
    "先",
    "还是",
    "但是",
    "不过",
    "所以",
    "而且",
    "当然",
    "可能",
    "似乎",
    "好像",
    "这个问题",
    "这个方案",
    "有没有",
    "帮我",
    "给我",
    "看一下",
    "继续",
    "开始",
    "修复",
    "提取",
    "ok",
    "好的",
    "好",
]

REASON_MARKERS = [
    "因为",
    "所以",
    "但是",
    "不过",
    "反而",
    "本质",
    "根本",
    "问题是",
    "意味着",
    "取决于",
    "不取决于",
    "不是",
    "而是",
]
PREFERENCE_MARKERS = [
    "我觉得",
    "我认为",
    "我想",
    "我更",
    "我还是",
    "我突然觉得",
    "其实我",
    "不自然",
    "太生硬",
    "不应该",
    "不要",
    "不用",
    "希望",
    "建议",
]
DIRECTIVE_MARKERS = [
    "帮我",
    "给我",
    "看一下",
    "检查",
    "分析",
    "修复",
    "写入",
    "提取",
    "开始",
    "继续",
    "直接",
    "先",
    "新开",
    "派",
    "使用",
    "删除",
    "更新",
]
TECH_MARKERS = [
    "代码",
    "测试",
    "实现",
    "方案",
    "问题",
    "接口",
    "权限",
    "进程",
    "目录",
    "文件",
    "正则",
    "沙箱",
    "agent",
    "api",
    "pr",
    "issue",
    "bug",
    "windows",
    "linux",
    "docker",
]
STYLE_META_MARKERS = [
    "文风",
    "自然",
    "生硬",
    "口语",
    "大小写",
    "改写",
    "润色",
    "语气",
    "表达",
    "推文",
    "tweet",
    "文章",
    "标题",
    "字数",
]
EVALUATION_MARKERS = [
    "合理",
    "不合理",
    "自然",
    "不自然",
    "生硬",
    "别扭",
    "出戏",
    "复杂",
    "简单",
    "副作用",
    "闭环",
    "本质",
    "根本",
    "第一性原理",
    "有价值",
    "没意义",
    "不够",
    "太多",
    "太细",
]


@dataclass(frozen=True)
class Message:
    source: str
    session_id: str
    timestamp: float
    text: str


def parse_args() -> argparse.Namespace:
    user_profile = Path(os.environ.get("USERPROFILE", Path.home()))
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-root", type=Path, default=user_profile / ".codex")
    parser.add_argument(
        "--claude-history",
        type=Path,
        default=user_profile / ".claude" / "history.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repo_root / "content" / "Clippings" / "个人说话风格分析数据.json",
    )
    return parser.parse_args()


def parse_iso_timestamp(value: object, fallback: float) -> float:
    if not value:
        return fallback
    try:
        text = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(text).timestamp()
    except (ValueError, OverflowError):
        return fallback


def iter_codex_messages(root: Path, errors: Counter[str]) -> Iterable[Message]:
    seen: set[tuple[str, object, str]] = set()
    for path in sorted(root.rglob("rollout-*.jsonl")):
        uuids = re.findall(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            path.stem,
        )
        session_id = uuids[-1] if uuids else path.stem
        fallback = path.stat().st_mtime
        try:
            handle = path.open("r", encoding="utf-8", errors="replace")
        except OSError:
            errors["codex_open_error"] += 1
            continue

        with handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    errors["codex_json_error"] += 1
                    continue
                payload = record.get("payload") or {}
                if record.get("type") != "event_msg" or payload.get("type") != "user_message":
                    continue
                text = payload.get("message")
                if not isinstance(text, str):
                    continue
                raw_timestamp = record.get("timestamp")
                key = (session_id, raw_timestamp, text)
                if key in seen:
                    continue
                seen.add(key)
                yield Message(
                    source="codex",
                    session_id=session_id,
                    timestamp=parse_iso_timestamp(raw_timestamp, fallback),
                    text=text,
                )


def iter_claude_messages(path: Path, errors: Counter[str]) -> Iterable[Message]:
    seen: set[tuple[str, object, str]] = set()
    if not path.exists():
        errors["claude_history_missing"] += 1
        return

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                errors["claude_json_error"] += 1
                continue
            display = record.get("display")
            if not isinstance(display, str):
                continue
            session_id = str(record.get("sessionId") or "unknown")
            raw_timestamp = record.get("timestamp")
            key = (session_id, raw_timestamp, display)
            if key in seen:
                continue
            seen.add(key)
            try:
                timestamp = float(raw_timestamp) / 1000
            except (TypeError, ValueError):
                timestamp = 0
                errors["claude_timestamp_error"] += 1

            # Pasted payloads are deliberately omitted. They are evidence supplied
            # by the user, but not reliable evidence of the user's own voice.
            text = PASTE_PLACEHOLDER_RE.sub("", display)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            yield Message(
                source="claude",
                session_id=session_id,
                timestamp=timestamp,
                text=text,
            )


def code_log_score(text: str) -> float:
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return 0.0
    codeish = 0
    patterns = (
        "```",
        "Traceback ",
        "File \"",
        "at ",
        "@@ ",
        "diff --git",
        "SELECT ",
        "INSERT ",
        "def ",
        "class ",
        "import ",
        "from ",
        "const ",
        "function ",
        "{",
        "}",
        "[tool]",
    )
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(patterns) or re.match(r"^\s*[+\-]\s*\w", line):
            codeish += 1
    return codeish / len(lines)


def noise_reason(text: str) -> str | None:
    stripped = text.strip()
    if not stripped:
        return "empty_after_paste_removal"
    if stripped.startswith("# AGENTS.md instructions") or stripped.startswith("<environment_context>"):
        return "injected_context"
    if re.fullmatch(r"\$[A-Za-z][\w-]*", stripped) or re.fullmatch(r"/[A-Za-z][\w-]*", stripped):
        return "skill_or_slash_command"

    without_locations = URL_RE.sub("", stripped)
    without_locations = WINDOWS_PATH_RE.sub("", without_locations)
    without_locations = UNIX_PATH_RE.sub("", without_locations)
    if not HAN_RE.search(without_locations) and not re.search(r"[A-Za-z]{3,}", without_locations):
        return "path_url_or_symbol_only"

    if len(stripped) > 3500:
        return "likely_pasted_document"
    if len(stripped) > 240 and code_log_score(stripped) >= 0.55:
        return "code_or_log"
    if not HAN_RE.search(stripped) and code_log_score(stripped) >= 0.40:
        return "non_chinese_code_or_log"
    return None


def quantile(values: list[int], probability: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return round(ordered[lower] * (upper - index) + ordered[upper] * (index - lower))


def count_markers(text: str, markers: list[str]) -> int:
    lowered = text.lower()
    return sum(lowered.count(marker.lower()) for marker in markers)


def classify(text: str) -> set[str]:
    labels: set[str] = set()
    length = len(text.strip())
    if "?" in text or "？" in text or any(marker in text for marker in ["为什么", "怎么", "是否", "吗", "呢"]):
        labels.add("questions")
    if count_markers(text, PREFERENCE_MARKERS):
        labels.add("preference_and_correction")
    if count_markers(text, REASON_MARKERS) >= 2 and length >= 45:
        labels.add("reasoning")
    if count_markers(text, DIRECTIVE_MARKERS) and length <= 180:
        labels.add("directives")
    if count_markers(text, TECH_MARKERS) >= 2 and length >= 30:
        labels.add("technical_discussion")
    if count_markers(text, STYLE_META_MARKERS):
        labels.add("style_and_public_writing")
    if length >= 180 and count_markers(text, REASON_MARKERS):
        labels.add("long_form")
    if length <= 30:
        labels.add("short_collaboration")
    return labels


def sample_score(category: str, text: str) -> float:
    length = len(text)
    score = 0.0
    if category == "questions":
        score += 4 * (text.count("?") + text.count("？")) + count_markers(text, ["为什么", "怎么", "是不是", "能不能"])
        score -= abs(length - 80) / 100
    elif category == "preference_and_correction":
        score += 3 * count_markers(text, PREFERENCE_MARKERS)
        score += 2 * count_markers(text, ["不是", "而是", "更想", "太", "副作用"])
        score -= abs(length - 120) / 180
    elif category == "reasoning":
        score += 2 * count_markers(text, REASON_MARKERS)
        score += min(length, 500) / 120
    elif category == "directives":
        score += 2 * count_markers(text, DIRECTIVE_MARKERS)
        score += 2 if length <= 60 else 0
    elif category == "technical_discussion":
        score += count_markers(text, TECH_MARKERS)
        score += 2 * count_markers(text, REASON_MARKERS)
        score += min(length, 400) / 160
    elif category == "style_and_public_writing":
        score += 3 * count_markers(text, STYLE_META_MARKERS)
        score += 2 * count_markers(text, PREFERENCE_MARKERS)
    elif category == "long_form":
        score += min(length, 1000) / 100
        score += count_markers(text, REASON_MARKERS)
    elif category == "short_collaboration":
        score += 3 if 3 <= length <= 20 else 0
        score += count_markers(text, DIRECTIVE_MARKERS)
    return score


def select_samples(messages: list[Message], category: str, limit: int = 14) -> list[dict[str, object]]:
    candidates = []
    for message in messages:
        if category not in classify(message.text):
            continue
        if SENSITIVE_RE.search(message.text):
            continue
        if len(message.text) > 1600:
            continue
        candidates.append((sample_score(category, message.text), message))

    candidates.sort(key=lambda item: (-item[0], item[1].timestamp))
    selected: list[Message] = []
    session_counts: Counter[str] = Counter()
    normalized_seen: set[str] = set()
    for _, message in candidates:
        normalized = re.sub(r"\s+", "", message.text).lower()
        if normalized in normalized_seen or session_counts[message.session_id] >= 2:
            continue
        normalized_seen.add(normalized)
        session_counts[message.session_id] += 1
        selected.append(message)
        if len(selected) >= limit:
            break

    return [
        {
            "source": message.source,
            "session_id": message.session_id,
            "timestamp": datetime.fromtimestamp(message.timestamp, timezone.utc).isoformat(),
            "text": message.text,
        }
        for message in selected
    ]


def top_han_ngrams(messages: list[Message], sizes: tuple[int, ...] = (2, 3, 4, 5)) -> dict[str, list[list[object]]]:
    result: dict[str, list[list[object]]] = {}
    stop = {
        "这个",
        "一下",
        "一个",
        "我们",
        "现在",
        "已经",
        "可以",
        "需要",
        "没有",
        "什么",
        "怎么",
        "如果",
        "但是",
        "还是",
        "就是",
        "进行",
        "问题",
        "不是",
    }
    for size in sizes:
        counts: Counter[str] = Counter()
        for message in messages:
            per_message: set[str] = set()
            for run in HAN_RUN_RE.findall(message.text):
                per_message.update(run[index : index + size] for index in range(len(run) - size + 1))
            counts.update(per_message)
        common = [[gram, count] for gram, count in counts.most_common(100) if gram not in stop][:30]
        result[str(size)] = common
    return result


def main() -> None:
    args = parse_args()
    errors: Counter[str] = Counter()
    raw_messages = list(iter_codex_messages(args.codex_root, errors))
    raw_messages.extend(iter_claude_messages(args.claude_history, errors))
    raw_messages.sort(key=lambda message: (message.timestamp, message.source, message.session_id))

    noise_counts: Counter[str] = Counter()
    messages: list[Message] = []
    for message in raw_messages:
        reason = noise_reason(message.text)
        if reason:
            noise_counts[reason] += 1
        else:
            messages.append(message)

    lengths = [len(message.text.strip()) for message in messages]
    total_chars = sum(lengths)
    total_han = sum(len(HAN_RE.findall(message.text)) for message in messages)
    source_counts = Counter(message.source for message in messages)
    category_counts: Counter[str] = Counter()
    phrase_counts: Counter[str] = Counter()
    phrase_message_counts: Counter[str] = Counter()
    english_counts: Counter[str] = Counter()
    english_case_counts: Counter[str] = Counter()
    punctuation_counts: Counter[str] = Counter()
    terminal_counts: Counter[str] = Counter()
    boundary_counts: Counter[str] = Counter()
    length_band_counts: Counter[str] = Counter()
    rhetorical_pattern_counts: Counter[str] = Counter()
    evaluation_counts: Counter[str] = Counter()
    opening_counts: Counter[str] = Counter()
    ending_counts: Counter[str] = Counter()

    shape_counts: Counter[str] = Counter()
    for message in messages:
        text = message.text.strip()
        for label in classify(text):
            category_counts[label] += 1
        for phrase in PHRASES:
            occurrences = text.lower().count(phrase.lower())
            phrase_counts[phrase] += occurrences
            if occurrences:
                phrase_message_counts[phrase] += 1

        lexical_text = URL_RE.sub("", text)
        lexical_text = WINDOWS_PATH_RE.sub("", lexical_text)
        lexical_text = UNIX_PATH_RE.sub("", lexical_text)
        english_tokens = [token for token in ENGLISH_RE.findall(lexical_text) if len(token) >= 2]
        english_counts.update(token.lower() for token in english_tokens)
        for token in english_tokens:
            if token.islower():
                english_case_counts["lowercase"] += 1
            elif token.isupper():
                english_case_counts["uppercase"] += 1
            elif token[:1].isupper() and token[1:].islower():
                english_case_counts["titlecase"] += 1
            else:
                english_case_counts["mixed_or_identifier"] += 1

        punctuation_counts.update(char for char in text if char in "，。！？?!：:；;、,.…")
        terminal = text[-1]
        if terminal in "？?":
            terminal_counts["question"] += 1
        elif terminal in "。.":
            terminal_counts["period"] += 1
        elif terminal in "！!":
            terminal_counts["exclamation"] += 1
        elif terminal in "：:；;,，、":
            terminal_counts["comma_colon_or_semicolon"] += 1
        else:
            terminal_counts["no_terminal_punctuation"] += 1

        boundary_counts["han_space_ascii"] += len(re.findall(r"[\u3400-\u9fff] +[A-Za-z0-9]", text))
        boundary_counts["ascii_space_han"] += len(re.findall(r"[A-Za-z0-9] +[\u3400-\u9fff]", text))
        boundary_counts["han_touching_ascii"] += len(re.findall(r"[\u3400-\u9fff][A-Za-z0-9]", text))
        boundary_counts["ascii_touching_han"] += len(re.findall(r"[A-Za-z0-9][\u3400-\u9fff]", text))

        if len(text) <= 15:
            length_band_counts["1-15"] += 1
        elif len(text) <= 30:
            length_band_counts["16-30"] += 1
        elif len(text) <= 60:
            length_band_counts["31-60"] += 1
        elif len(text) <= 120:
            length_band_counts["61-120"] += 1
        elif len(text) <= 300:
            length_band_counts["121-300"] += 1
        else:
            length_band_counts["301+"] += 1

        rhetorical_patterns = {
            "不是_而是": r"不是.{0,120}而是",
            "虽然_但是": r"虽然.{0,120}但是",
            "如果_就": r"如果.{0,120}(?:那么|就)",
            "先_再": r"先.{0,100}再",
            "你觉得呢": r"你觉得(?:呢|咧|如何)?[？?]?",
            "是否合理": r"是否合理|这样合理吗|合理吗",
            "是不是": r"是不是",
            "为什么": r"为什么",
            "不确定": r"不确定",
        }
        for name, pattern in rhetorical_patterns.items():
            if re.search(pattern, text, re.DOTALL | re.IGNORECASE):
                rhetorical_pattern_counts[name] += 1

        for marker in EVALUATION_MARKERS:
            occurrences = text.lower().count(marker.lower())
            if occurrences:
                evaluation_counts[marker] += occurrences

        compact = re.sub(r"\s+", "", text)
        if compact:
            opening_counts[compact[: min(6, len(compact))]] += 1
            ending_counts[compact[-min(6, len(compact)) :]] += 1
        if "\n" not in text:
            shape_counts["single_line"] += 1
        if re.search(r" {2,}", text):
            shape_counts["repeated_spaces"] += 1
        if re.search(r"[\u3400-\u9fff] [A-Za-z0-9]", text):
            shape_counts["space_han_to_ascii"] += 1
        if re.search(r"[A-Za-z0-9] [\u3400-\u9fff]", text):
            shape_counts["space_ascii_to_han"] += 1
        if re.search(r"[\u3400-\u9fff][A-Za-z]", text):
            shape_counts["no_space_han_to_ascii"] += 1
        if re.search(r"[A-Za-z][\u3400-\u9fff]", text):
            shape_counts["no_space_ascii_to_han"] += 1
        if "?" in text:
            shape_counts["ascii_question"] += 1
        if "？" in text:
            shape_counts["chinese_question"] += 1
        if text.startswith("我"):
            shape_counts["starts_with_wo"] += 1
        if "我" in text:
            shape_counts["contains_wo"] += 1
        if any(token.islower() and len(token) >= 2 for token in english_tokens):
            shape_counts["contains_lowercase_english"] += 1
        if any(token[:1].isupper() and token[1:].islower() for token in english_tokens):
            shape_counts["contains_titlecase_english"] += 1

    sample_categories = [
        "preference_and_correction",
        "reasoning",
        "questions",
        "directives",
        "technical_discussion",
        "style_and_public_writing",
        "long_form",
        "short_collaboration",
    ]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": {
            "codex": "All event_msg/user_message records in every rollout-*.jsonl under .codex, deduplicated by session, timestamp, and text.",
            "claude": "All display fields in .claude/history.jsonl. Pasted payloads are excluded from style analysis.",
            "filtering": "Empty records, injected context, bare skill commands, path/URL-only messages, likely pasted documents, and code/log-heavy records are excluded.",
        },
        "corpus": {
            "raw_message_count": len(raw_messages),
            "style_candidate_count": len(messages),
            "excluded_count": len(raw_messages) - len(messages),
            "source_counts": dict(source_counts),
            "noise_counts": dict(noise_counts),
            "parse_errors": dict(errors),
            "character_count": total_chars,
            "han_character_count": total_han,
            "length": {
                "min": min(lengths, default=0),
                "p25": quantile(lengths, 0.25),
                "median": quantile(lengths, 0.5),
                "p75": quantile(lengths, 0.75),
                "p90": quantile(lengths, 0.9),
                "p95": quantile(lengths, 0.95),
                "max": max(lengths, default=0),
                "mean": round(total_chars / len(lengths), 2) if lengths else 0,
            },
        },
        "category_counts": dict(category_counts.most_common()),
        "phrase_counts": dict(phrase_counts.most_common()),
        "phrase_message_counts": dict(phrase_message_counts.most_common()),
        "shape_counts": dict(shape_counts.most_common()),
        "punctuation_counts": dict(punctuation_counts.most_common()),
        "terminal_counts": dict(terminal_counts.most_common()),
        "mixed_language_boundary_counts": dict(boundary_counts.most_common()),
        "english_case_counts": dict(english_case_counts.most_common()),
        "length_band_counts": dict(length_band_counts),
        "rhetorical_pattern_counts": dict(rhetorical_pattern_counts.most_common()),
        "evaluation_counts": dict(evaluation_counts.most_common()),
        "common_english_tokens": english_counts.most_common(80),
        "common_openings": opening_counts.most_common(50),
        "common_endings": ending_counts.most_common(50),
        "common_han_ngrams": top_han_ngrams(messages),
        "samples": {
            category: select_samples(messages, category)
            for category in sample_categories
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "raw_messages": len(raw_messages),
        "style_candidates": len(messages),
        "excluded": len(raw_messages) - len(messages),
        "parse_errors": dict(errors),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
