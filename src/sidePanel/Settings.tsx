import AnimatedBackground from './AnimatedBackground';
import { MiscSettings } from './MiscSettings';

export const Settings = () => {
  return (
    <div
      className="relative z-[1] top-0 w-full h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent text-foreground p-6 scrollbar-hidden"
      id="settings"
    >
      <AnimatedBackground />
      <MiscSettings />
    </div>
  );
};
