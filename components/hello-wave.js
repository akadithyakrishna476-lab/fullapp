import { useEffect, useState } from "react";
import { Text } from "react-native";

export function HelloWave() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let animationInterval;
    let frame = 0;

    const animate = () => {
      frame += 1;
      const progress = (frame % 8) / 8;
      const rotate = progress < 0.5 ? progress * 50 : (1 - progress) * 50;
      setRotation(rotate);

      if (frame < 32) {
        animationInterval = setTimeout(animate, 300 / 8);
      }
    };

    animate();

    return () => clearTimeout(animationInterval);
  }, []);

  return (
    <Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    >
      👋
    </Text>
  );
}
