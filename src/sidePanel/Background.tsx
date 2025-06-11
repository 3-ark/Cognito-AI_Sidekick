import { cn } from "@/src/background/util";
import { useConfig } from './ConfigContext';
import { DEFAULT_PERSONA_IMAGES } from "./constants";

export const Background = () => {
  const { config } = useConfig();
  const currentPersona = config?.persona || 'default';
  const src = config?.personaAvatars?.[currentPersona] || DEFAULT_PERSONA_IMAGES[currentPersona] || DEFAULT_PERSONA_IMAGES.default;

  const containerClasses = cn(
    "flex",
    "items-center",
    "justify-center",
    "h-full",
    "fixed",
    "w-full",
    "top-[10%]",
    "pointer-events-none"
  );

  const imageClasses = cn(
    "fixed",
    "opacity-[0.03]",
    "z-[1]"
  );

  return (
    <div className={containerClasses}>
      <img
        src={src}
        alt=""
        className={imageClasses}
        style={{
          zoom: '1.2',
        }}
      />
    </div>
  );
};