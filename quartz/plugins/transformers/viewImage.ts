import { QuartzTransformerPlugin } from "../types"

export const ViewImage: QuartzTransformerPlugin = () => {
  return {
    name: "ViewImage",
    externalResources() {
      return {
        css: [
          {
            content: `
              img {
                cursor: zoom-in !important;
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
                  const existingImages = document.querySelectorAll('img[data-viewimage]');
                  existingImages.forEach(img => {
                    img.removeAttribute('data-viewimage');
                    const newImg = img.cloneNode(true);
                    img.parentNode.replaceChild(newImg, img);
                  });
                  
                  ViewImage.init('img');
                  console.log('ViewImage灯箱插件已初始化，处理了', document.querySelectorAll('img').length, '张图片');
                } else {
                  console.error('ViewImage库未加载成功');
                }
              }
              
              function setupViewImageObserver() {
                const observer = new MutationObserver(function(mutations) {
                  let shouldReinit = false;
                  mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList') {
                      mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                          const element = node;
                          if (element.tagName === 'IMG' || element.querySelector('img')) {
                            shouldReinit = true;
                          }
                        }
                      });
                    }
                  });
                  
                  if (shouldReinit) {
                    console.log('检测到页面内容变化，重新初始化 ViewImage');
                    setTimeout(initViewImage, 50);
                  }
                });
                
                observer.observe(document.body, {
                  childList: true,
                  subtree: true
                });
                
                return observer;
              }
              
              document.addEventListener('DOMContentLoaded', function() {
                initViewImage();
                setupViewImageObserver();
              });
              
              document.addEventListener('nav', function() {
                console.log('SPA 导航事件触发，准备重新初始化 ViewImage');
                setTimeout(function() {
                  initViewImage();
                }, 200);
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