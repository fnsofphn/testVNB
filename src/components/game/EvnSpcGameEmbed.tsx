import EvnSpcGamificationApp from '@/components/game/vendor/EvnSpcGamificationApp.jsx';

type EvnSpcGameEmbedProps = {
  className?: string;
};

export function EvnSpcGameEmbed({ className = '' }: EvnSpcGameEmbedProps) {
  return (
    <div className={`evnspc-game-shell ${className}`.trim()}>
      <EvnSpcGamificationApp />
    </div>
  );
}
