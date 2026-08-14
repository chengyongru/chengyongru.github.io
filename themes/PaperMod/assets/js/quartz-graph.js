/*
 * Ported from @quartz-community/graph for Quartz v5.
 * Upstream commit: 411971434ab698c495dfc42870eb02d3bc539b3a
 * Source: https://github.com/quartz-community/graph/blob/main/src/components/scripts/graph.inline.ts
 *
 * MIT License
 *
 * Copyright (c) 2026 Quartz Community
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Hugo adapter notes: Quartz's fetchData content index is replaced by the JSON
 * emitted by taxonomy.html, and resolveBasePath is replaced by each node's URL.
 */

(function () {
    function loadScript(src) {
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = src;
            script.crossOrigin = "anonymous";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    Promise.all([
        loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"),
        loadScript("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js"),
    ])
        .then(initGraph)
        .catch(function (error) {
            console.error("[Graph] Failed to load libraries:", error);
            showGraphError("Graph could not load. Check your network connection.");
        });

    function showGraphError(message) {
        var containers = document.querySelectorAll(".global-graph-container");
        for (var i = 0; i < containers.length; i++) {
            containers[i].textContent = message;
            containers[i].style.display = "flex";
            containers[i].style.alignItems = "center";
            containers[i].style.justifyContent = "center";
            containers[i].style.color = "var(--secondary)";
            containers[i].style.fontSize = "0.9rem";
        }
    }

    function initGraph() {
        var d3 = window.d3;
        var PIXI = window.PIXI;
        var graph = document.getElementById("quartz-graph");
        var dataElement = document.getElementById("graph-data");
        var overlay = document.querySelector(".global-graph-outer");
        var triggers = Array.from(document.querySelectorAll(".global-graph-trigger"));

        if (!d3 || !PIXI || !graph || !dataElement || !overlay) {
            console.error("[Graph] Libraries or graph data not loaded");
            return;
        }

        var sourceData;
        try {
            sourceData = JSON.parse(dataElement.textContent);
        } catch (error) {
            console.error("[Graph] Invalid graph data:", error);
            showGraphError("Graph data could not be loaded.");
            return;
        }

        var localStorageKey = "graph-visited";
        var cleanup = function () {};
        var renderGeneration = 0;
        var resizeTimer;

        function getVisited() {
            try {
                return new Set(JSON.parse(localStorage.getItem(localStorageKey) || "[]"));
            } catch (_) {
                return new Set();
            }
        }

        function addToVisited(id) {
            var visited = getVisited();
            visited.add(id);
            localStorage.setItem(localStorageKey, JSON.stringify(Array.from(visited)));
        }

        function removeAllChildren(element) {
            while (element.firstChild) element.removeChild(element.firstChild);
        }

        // Copied from the v5 plugin: let the browser resolve CSS values before
        // passing them to PixiJS, which cannot evaluate var()/calc() itself.
        function resolveColor(value, fallback) {
            if (!value) return fallback;
            var element = document.createElement("div");
            element.style.color = value;
            element.style.position = "absolute";
            element.style.visibility = "hidden";
            document.body.appendChild(element);
            var resolved = getComputedStyle(element).color;
            element.remove();
            return resolved || fallback;
        }

        async function renderGraph(container, currentGeneration) {
            var visited = getVisited();
            removeAllChildren(container);

            var width = container.offsetWidth;
            var height = Math.max(container.offsetHeight, 250);
            var scale = 1;
            var repelForce = 0.5;
            var centerForce = 0.2;
            var linkDistance = 30;
            var fontSize = 18;
            var opacityScale = 1;
            var focusOnHover = true;
            var enableRadial = true;

            var nodes = [];
            var nodeMap = new Map();
            for (var i = 0; i < sourceData.nodes.length; i++) {
                var sourceNode = sourceData.nodes[i];
                var node = {
                    id: sourceNode.id,
                    text: sourceNode.text,
                    url: sourceNode.url,
                    kind: sourceNode.kind,
                    x: Math.random() * width - width / 2,
                    y: Math.random() * height - height / 2,
                    vx: 0,
                    vy: 0,
                };
                nodes.push(node);
                nodeMap.set(node.id, node);
            }

            var graphLinks = [];
            for (var linkIndex = 0; linkIndex < sourceData.links.length; linkIndex++) {
                var sourceLink = sourceData.links[linkIndex];
                var source = nodeMap.get(sourceLink.source);
                var target = nodeMap.get(sourceLink.target);
                if (source && target) graphLinks.push({ source: source, target: target });
            }

            var styles = getComputedStyle(document.documentElement);
            var secondary = resolveColor(styles.getPropertyValue("--graph-accent").trim(), "#70a099");
            var tertiary = secondary;
            var gray = resolveColor(styles.getPropertyValue("--graph-node").trim(), "#aeb1b2");
            var lightgray = resolveColor(styles.getPropertyValue("--graph-link").trim(), "#dcdee0");
            var dark = resolveColor(styles.getPropertyValue("--primary").trim(), "#1e1e1e");
            var light = resolveColor(styles.getPropertyValue("--theme").trim(), "#ffffff");
            var bodyFont = getComputedStyle(document.body).fontFamily || "inherit";

            var app = new PIXI.Application();
            await app.init({
                width: width,
                height: height,
                antialias: true,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                eventMode: "static",
            });

            if (currentGeneration !== renderGeneration) {
                app.destroy(true);
                return function () {};
            }

            container.appendChild(app.canvas);
            var stage = new PIXI.Container();
            app.stage.addChild(stage);

            var simulation = d3
                .forceSimulation(nodes)
                .force("charge", d3.forceManyBody().strength(-100 * repelForce))
                .force("center", d3.forceCenter().strength(centerForce))
                .force("link", d3.forceLink(graphLinks).distance(linkDistance))
                .force(
                    "collide",
                    d3.forceCollide().radius(function (nodeData) {
                        var numLinks = 0;
                        for (var j = 0; j < graphLinks.length; j++) {
                            if (graphLinks[j].source.id === nodeData.id || graphLinks[j].target.id === nodeData.id) {
                                numLinks++;
                            }
                        }
                        return 2 + Math.sqrt(numLinks);
                    }).iterations(3),
                );

            if (enableRadial) {
                var radialRadius = (Math.min(width, height) / 2) * 0.8;
                simulation.force("radial", d3.forceRadial(radialRadius).strength(0.2));
            }

            var linkContainer = new PIXI.Container();
            var nodesContainer = new PIXI.Container();
            var labelsContainer = new PIXI.Container();
            stage.addChild(linkContainer);
            stage.addChild(nodesContainer);
            stage.addChild(labelsContainer);

            var nodeRenderData = [];
            var linkRenderData = [];
            var hoveredNodeId = null;
            var hoveredNeighbours = new Set();
            var dragStartTime = 0;
            var dragging = false;
            var currentTransform = d3.zoomIdentity;

            function nodeRadius(nodeData) {
                var numLinks = 0;
                for (var j = 0; j < graphLinks.length; j++) {
                    if (graphLinks[j].source.id === nodeData.id || graphLinks[j].target.id === nodeData.id) {
                        numLinks++;
                    }
                }
                return 2 + Math.sqrt(numLinks);
            }

            function nodeColor(nodeData) {
                if (visited.has(nodeData.id) || nodeData.kind === "tag") return tertiary;
                return gray;
            }

            function updateHoverInfo(nextHoveredId) {
                hoveredNodeId = nextHoveredId;

                if (nextHoveredId === null) {
                    hoveredNeighbours = new Set();
                    for (var j = 0; j < nodeRenderData.length; j++) nodeRenderData[j].active = false;
                    for (var k = 0; k < linkRenderData.length; k++) linkRenderData[k].active = false;
                } else {
                    hoveredNeighbours = new Set();
                    for (var linkRenderIndex = 0; linkRenderIndex < linkRenderData.length; linkRenderIndex++) {
                        var linkData = linkRenderData[linkRenderIndex].simulationData;
                        if (linkData.source.id === nextHoveredId || linkData.target.id === nextHoveredId) {
                            hoveredNeighbours.add(linkData.source.id);
                            hoveredNeighbours.add(linkData.target.id);
                            linkRenderData[linkRenderIndex].active = true;
                        } else {
                            linkRenderData[linkRenderIndex].active = false;
                        }
                    }
                    hoveredNeighbours.add(nextHoveredId);
                    for (var nodeRenderIndex = 0; nodeRenderIndex < nodeRenderData.length; nodeRenderIndex++) {
                        nodeRenderData[nodeRenderIndex].active = hoveredNeighbours.has(
                            nodeRenderData[nodeRenderIndex].simulationData.id,
                        );
                    }
                }
            }

            function renderLinks() {
                for (var j = 0; j < linkRenderData.length; j++) {
                    var renderedLink = linkRenderData[j];
                    renderedLink.alpha = hoveredNodeId === null || renderedLink.active ? 1 : 0.2;
                    renderedLink.color = renderedLink.active ? gray : lightgray;
                }
            }

            function renderLabels() {
                var defaultScale = 1 / scale;
                for (var j = 0; j < nodeRenderData.length; j++) {
                    var renderedNode = nodeRenderData[j];
                    if (hoveredNodeId === renderedNode.simulationData.id) {
                        renderedNode.label.alpha = 1;
                        renderedNode.label.scale.set(defaultScale);
                    } else {
                        renderedNode.label.scale.set(defaultScale);
                    }
                }
            }

            function renderNodes() {
                for (var j = 0; j < nodeRenderData.length; j++) {
                    var renderedNode = nodeRenderData[j];
                    renderedNode.gfx.alpha = hoveredNodeId !== null && focusOnHover && !renderedNode.active ? 0.2 : 1;
                }
            }

            function renderPixiFromD3() {
                renderNodes();
                renderLinks();
                renderLabels();
            }

            for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
                var graphNode = nodes[nodeIndex];
                var isTagNode = graphNode.kind === "tag";
                var radius = nodeRadius(graphNode);
                var color = nodeColor(graphNode);
                var label = new PIXI.Text({
                    text: graphNode.text,
                    style: { fontSize: fontSize, fill: dark, fontFamily: bodyFont },
                    resolution: window.devicePixelRatio * 4,
                });
                label.anchor.set(0.5, 1.2);
                label.alpha = 0;
                label.scale.set(1 / scale);
                label.roundPixels = true;
                labelsContainer.addChild(label);

                var gfx = new PIXI.Graphics();
                gfx.circle(0, 0, radius);
                gfx.fill({ color: isTagNode ? light : color });
                if (isTagNode) gfx.stroke({ width: 2, color: tertiary });
                gfx.eventMode = "static";
                gfx.cursor = "pointer";
                gfx.label = graphNode.id;

                (function (nodeData, graphic, labelReference) {
                    var oldLabelOpacity = 0;
                    graphic.on("pointerover", function () {
                        updateHoverInfo(nodeData.id);
                        oldLabelOpacity = labelReference.alpha;
                        if (!dragging) renderPixiFromD3();
                    });
                    graphic.on("pointerleave", function () {
                        updateHoverInfo(null);
                        labelReference.alpha = oldLabelOpacity;
                        if (!dragging) renderPixiFromD3();
                    });
                })(graphNode, gfx, label);

                nodesContainer.addChild(gfx);
                nodeRenderData.push({
                    simulationData: graphNode,
                    gfx: gfx,
                    label: label,
                    color: color,
                    alpha: 1,
                    active: false,
                });
            }

            for (var graphLinkIndex = 0; graphLinkIndex < graphLinks.length; graphLinkIndex++) {
                var graphLink = graphLinks[graphLinkIndex];
                var linkGraphic = new PIXI.Graphics();
                linkGraphic.eventMode = "none";
                linkContainer.addChild(linkGraphic);
                linkRenderData.push({
                    simulationData: graphLink,
                    gfx: linkGraphic,
                    color: lightgray,
                    alpha: 1,
                    active: false,
                });
            }

            function dragSubject(event) {
                var mouseX = (event.x - currentTransform.x) / currentTransform.k;
                var mouseY = (event.y - currentTransform.y) / currentTransform.k;
                for (var j = 0; j < nodes.length; j++) {
                    var candidate = nodes[j];
                    var dx = mouseX - candidate.x - width / 2;
                    var dy = mouseY - candidate.y - height / 2;
                    var distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < nodeRadius(candidate) + 5) return candidate;
                }
                return null;
            }

            var graphDrag = d3.drag()
                .container(app.canvas)
                .subject(dragSubject)
                .on("start", function (event) {
                    if (!event.active) simulation.alphaTarget(1).restart();
                    event.subject.fx = event.subject.x;
                    event.subject.fy = event.subject.y;
                    var mouseSimX = (event.x - currentTransform.x) / currentTransform.k - width / 2;
                    var mouseSimY = (event.y - currentTransform.y) / currentTransform.k - height / 2;
                    event.subject.__dragOffset = {
                        x: mouseSimX - event.subject.x,
                        y: mouseSimY - event.subject.y,
                    };
                    dragStartTime = Date.now();
                    dragging = true;
                    hoveredNodeId = event.subject.id;
                })
                .on("drag", function (event) {
                    var mouseSimX = (event.x - currentTransform.x) / currentTransform.k - width / 2;
                    var mouseSimY = (event.y - currentTransform.y) / currentTransform.k - height / 2;
                    event.subject.fx = mouseSimX - event.subject.__dragOffset.x;
                    event.subject.fy = mouseSimY - event.subject.__dragOffset.y;
                })
                .on("end", function (event) {
                    if (!event.active) simulation.alphaTarget(0);
                    event.subject.fx = null;
                    event.subject.fy = null;
                    dragging = false;
                    updateHoverInfo(null);
                    renderPixiFromD3();
                    if (Date.now() - dragStartTime < 500) {
                        addToVisited(event.subject.id);
                        window.location.href = event.subject.url;
                    }
                });
            d3.select(app.canvas).call(graphDrag);

            var graphZoom = d3.zoom()
                .extent([[0, 0], [width, height]])
                .scaleExtent([0.25, 4])
                .on("zoom", function (event) {
                    currentTransform = event.transform;
                    stage.scale.set(currentTransform.k, currentTransform.k);
                    stage.position.set(currentTransform.x, currentTransform.y);
                    var newScale = currentTransform.k * opacityScale;
                    var scaleOpacity = Math.max((newScale - 1) / 3.75, 0);
                    var activeLabels = [];
                    for (var j = 0; j < nodeRenderData.length; j++) {
                        if (nodeRenderData[j].active) activeLabels.push(nodeRenderData[j].label);
                    }
                    for (var labelIndex = 0; labelIndex < labelsContainer.children.length; labelIndex++) {
                        var zoomLabel = labelsContainer.children[labelIndex];
                        if (activeLabels.indexOf(zoomLabel) === -1) zoomLabel.alpha = scaleOpacity;
                    }
                });
            d3.select(app.canvas).call(graphZoom);

            var stopAnimation = false;
            function animate() {
                if (stopAnimation) return;
                for (var j = 0; j < nodeRenderData.length; j++) {
                    var renderedNode = nodeRenderData[j];
                    var x = renderedNode.simulationData.x;
                    var y = renderedNode.simulationData.y;
                    if (x != null && y != null) {
                        renderedNode.gfx.position.set(x + width / 2, y + height / 2);
                        renderedNode.label.position.set(
                            Math.round(x + width / 2),
                            Math.round(y + height / 2),
                        );
                    }
                }

                for (var k = 0; k < linkRenderData.length; k++) {
                    var renderedLink = linkRenderData[k];
                    var linkData = renderedLink.simulationData;
                    var sx = linkData.source.x;
                    var sy = linkData.source.y;
                    var tx = linkData.target.x;
                    var ty = linkData.target.y;
                    if (sx != null && sy != null && tx != null && ty != null) {
                        renderedLink.gfx.clear();
                        renderedLink.gfx.moveTo(sx + width / 2, sy + height / 2);
                        renderedLink.gfx.lineTo(tx + width / 2, ty + height / 2);
                        renderedLink.gfx.stroke({ alpha: renderedLink.alpha, width: 1, color: renderedLink.color });
                    }
                }
                requestAnimationFrame(animate);
            }

            simulation.restart();
            renderPixiFromD3();
            animate();

            return function () {
                stopAnimation = true;
                simulation.stop();
                try {
                    app.destroy(true);
                } catch (_) {
                    // PixiJS may throw if the graphics context was already lost.
                }
            };
        }

        async function startGraph() {
            if (!overlay.classList.contains("active")) return;
            var generation = ++renderGeneration;
            cleanup();
            try {
                cleanup = await renderGraph(graph, generation);
            } catch (error) {
                console.error("[Graph] Render error:", error);
                showGraphError("Graph could not be loaded.");
            }
        }

        var resizeObserver = new ResizeObserver(function () {
            if (!overlay.classList.contains("active")) return;
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(startGraph, 120);
        });
        resizeObserver.observe(graph);

        function showGlobalGraph() {
            if (overlay.classList.contains("active")) return;
            overlay.classList.add("active");
            overlay.setAttribute("aria-hidden", "false");
            for (var i = 0; i < triggers.length; i++) {
                triggers[i].setAttribute("aria-expanded", "true");
            }
            requestAnimationFrame(startGraph);
        }

        function hideGlobalGraph() {
            if (!overlay.classList.contains("active")) return;
            ++renderGeneration;
            cleanup();
            cleanup = function () {};
            removeAllChildren(graph);
            overlay.classList.remove("active");
            overlay.setAttribute("aria-hidden", "true");
            for (var i = 0; i < triggers.length; i++) {
                triggers[i].setAttribute("aria-expanded", "false");
            }
        }

        function toggleGlobalGraph() {
            if (overlay.classList.contains("active")) {
                hideGlobalGraph();
            } else {
                showGlobalGraph();
            }
        }

        for (var triggerIndex = 0; triggerIndex < triggers.length; triggerIndex++) {
            triggers[triggerIndex].addEventListener("click", function (event) {
                event.preventDefault();
                toggleGlobalGraph();
            });
        }

        overlay.addEventListener("click", function (event) {
            if (!event.target.closest(".global-graph-container")) hideGlobalGraph();
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && overlay.classList.contains("active")) {
                hideGlobalGraph();
                return;
            }
            if (event.key === "g" && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
                event.preventDefault();
                toggleGlobalGraph();
            }
        });

        document.addEventListener("themechange", function () {
            if (overlay.classList.contains("active")) startGraph();
        });
        window.addEventListener("pagehide", function () {
            resizeObserver.disconnect();
            cleanup();
        }, { once: true });

        if (triggers.some(function (trigger) {
            return new URL(trigger.href, window.location.href).pathname === window.location.pathname;
        })) {
            showGlobalGraph();
        }
    }
})();
