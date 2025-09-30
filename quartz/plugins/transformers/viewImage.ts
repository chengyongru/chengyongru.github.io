import { QuartzTransformerPlugin } from "../types"

export const ViewImage: QuartzTransformerPlugin = () => {
  return {
    name: "ViewImage",
    externalResources() {
      return {
        css: [
          {
            content: `
              @media (min-width: 800px) {
                img {
                  cursor: zoom-in !important;
                }
              }
            `,
            inline: true,
          },
        ],
        js: [
          {
            src: "https://cdn.jsdelivr.net/gh/Tokinx/ViewImage/view-image.min.js",
            loadTime: "afterDOMReady",
            contentType: "external",
          },
          {
            script: `
              function initViewImage() {
                if (window.ViewImage) {
                  ViewImage.init('img');
                  console.log('ViewImage灯箱插件已初始化，处理了', document.querySelectorAll('img').length, '张图片');
                } else {
                  console.error('ViewImage库未加载成功');
                }
              }
              
              document.addEventListener('DOMContentLoaded', function() {
                initViewImage();
              });
              
              document.addEventListener('nav', function() {
                console.log('SPA 导航事件触发，准备重新初始化 ViewImage');
                setTimeout(function() {
                  initViewImage();
                }, 100);
              });
            `,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    viewImage?: boolean
  }
}