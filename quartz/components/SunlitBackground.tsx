import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import sunlitScript from "./scripts/sunlit.inline"

const SunlitBackground: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div id="dappled-light" className={displayClass}>
      <div id="glow"></div>
      <div id="glow-bounce"></div>
      <div className="perspective">
        <div id="leaves">
          <svg style={{ width: 0, height: 0, position: "absolute" }}>
            <defs>
              <filter id="wind" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" numOctaves="2" seed="1">
                  <animate 
                    attributeName="baseFrequency" 
                    dur="16s" 
                    keyTimes="0;0.33;0.66;1"
                    values="0.005 0.003;0.01 0.009;0.008 0.004;0.005 0.003" 
                    repeatCount="indefinite" 
                  />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic">
                  <animate 
                    attributeName="scale" 
                    dur="20s" 
                    keyTimes="0;0.25;0.5;0.75;1" 
                    values="45;55;75;55;45"
                    repeatCount="indefinite" 
                  />
                </feDisplacementMap>
              </filter>
            </defs>
          </svg>
        </div>
        <div id="blinds">
          <div className="shutters">
            {Array.from({ length: 23 }, (_, i) => (
              <div key={i} className="shutter"></div>
            ))}
          </div>
          <div className="vertical">
            <div className="bar"></div>
            <div className="bar"></div>
          </div>
        </div>
      </div>
      <div id="progressive-blur">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  )
}

SunlitBackground.css = `
/* Sunlit Background Styles */
#dappled-light {
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 100vw;
  z-index: -1;
  overflow: hidden;
}

#progressive-blur {
  position: absolute;
  height: 100%;
  width: 100%;
}

#progressive-blur>div {
  position: absolute;
  height: 100%;
  width: 100%;
  inset: 0;
  backdrop-filter: blur(var(--blur-amount));
  mask-image: linear-gradient(252deg, transparent, transparent var(--stop1), black var(--stop2), black);
}

#progressive-blur>div:nth-child(1) {
  --blur-amount: 6px;
  --stop1: 0%;
  --stop2: 0%;
}

#progressive-blur>div:nth-child(2) {
  --blur-amount: 12px;
  --stop1: 40%;
  --stop2: 80%;
}

#progressive-blur>div:nth-child(3) {
  --blur-amount: 48px;
  --stop1: 40%;
  --stop2: 70%;
}

#progressive-blur>div:nth-child(4) {
  --blur-amount: 96px;
  --stop1: 70%;
  --stop2: 80%;
}

#glow {
  position: absolute;
  background: linear-gradient(309deg, var(--sunlit-bounce-light), var(--sunlit-bounce-light) 20%, transparent);
  transition: background 1.0s var(--sunlit-timing-fn);
  height: 100%;
  width: 100%;
  opacity: 0.5;
}

#glow-bounce {
  content: "";
  position: absolute;
  background: linear-gradient(355deg, var(--sunlit-bounce-light) 0%, transparent 30%, transparent 100%);
  transition: background 1.0s var(--sunlit-timing-fn);
  opacity: 0.5;
  height: 100%;
  width: 100%;
  bottom: 0;
}

.perspective {
  position: absolute;
  transition: transform 1.7s var(--sunlit-timing-fn), opacity 4s ease;
  top: -30vh;
  right: 0;
  width: 100vw;
  height: 130vh;
  opacity: 0.07;
  background-blend-mode: darken;
  transform-origin: top right;
  transform-style: preserve-3d;
  transform: matrix3d(0.7500, -0.0625, 0.0000, 0.0008,
      0.0000, 1.0000, 0.0000, 0.0000,
      0.0000, 0.0000, 1.0000, 0.0000,
      0.0000, 0.0000, 0.0000, 1.0000);
  
  /* 响应式调整 */
  @media (max-width: 1200px) {
    width: 120vw;
    right: -10vw;
  }
  
  @media (max-width: 768px) {
    width: 150vw;
    right: -25vw;
    top: -20vh;
    height: 120vh;
  }
}

.dark .perspective {
  opacity: 0.3;
  transform: matrix3d(0.8333, 0.0833, 0.0000, 0.0003,
      0.0000, 1.0000, 0.0000, 0.0000,
      0.0000, 0.0000, 1.0000, 0.0000,
      0.0000, 0.0000, 0.0000, 1.0000);
}

#leaves {
  position: absolute;
  background-size: cover;
  background-repeat: no-repeat;
  bottom: -20px;
  right: -700px;
  width: 1600px;
  height: 1400px;
  background-image: url("./static/leaves.png");
  filter: url(#wind);
  animation: billow 8s ease-in-out infinite;
  
  /* 响应式调整 */
  @media (max-width: 1200px) {
    right: -500px;
    width: 1400px;
    height: 1200px;
  }
  
  @media (max-width: 768px) {
    right: -300px;
    width: 1200px;
    height: 1000px;
    bottom: -50px;
  }
  
  @media (max-width: 480px) {
    right: -200px;
    width: 1000px;
    height: 800px;
    bottom: -100px;
  }
}

#blinds {
  position: relative;
  width: 100%;
}

#blinds .shutter,
#blinds .bar {
  background-color: var(--sunlit-shadow);
}

#blinds>.shutters {
  display: flex;
  flex-direction: column;
  align-items: end;
  gap: 60px;
  transition: gap 1.0s var(--sunlit-timing-fn);
  
  /* 响应式调整 */
  @media (max-width: 768px) {
    gap: 40px;
  }
  
  @media (max-width: 480px) {
    gap: 30px;
  }
}

.dark #blinds>.shutters {
  gap: 20px;
}

#blinds>.vertical {
  top: 0;
  position: absolute;
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: space-around;
}

.vertical>.bar {
  width: 5px;
  height: 100%;
}

.shutter {
  width: 100%;
  height: 40px;
  transition: height 1.0s var(--sunlit-timing-fn);
  
  /* 响应式调整 */
  @media (max-width: 768px) {
    height: 30px;
  }
  
  @media (max-width: 480px) {
    height: 25px;
  }
}

.dark .shutter {
  height: 80px;
  
  @media (max-width: 768px) {
    height: 60px;
  }
  
  @media (max-width: 480px) {
    height: 50px;
  }
}

@keyframes billow {
  0% {
    transform: perspective(400px) rotateX(0deg) rotateY(0deg) scale(1);
  }

  25% {
    transform: perspective(400px) rotateX(1deg) rotateY(2deg) scale(1.02);
  }

  50% {
    transform: perspective(400px) rotateX(-4deg) rotateY(-2deg) scale(0.97);
  }

  75% {
    transform: perspective(400px) rotateX(1deg) rotateY(-1deg) scale(1.04);
  }

  100% {
    transform: perspective(400px) rotateX(0deg) rotateY(0deg) scale(1);
  }
}
`

SunlitBackground.afterDOMLoaded = sunlitScript

export default (() => SunlitBackground) satisfies QuartzComponentConstructor
