import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

interface Props {
  size?: number;
}

/**
 * Brutzels Kopf, als React-Native-SVG nachgebaut aus dem im Chat etablierten
 * Maskottchen-Design (große Augen, Schnurrbart, Kochhaube mit Outline gegen
 * Weiss-auf-Weiss-Verschwimmen, siehe Design-Historie im Umsetzungskonzept).
 * Nur der Kopf, keine Vollfigur - passend fuer kleine Kontext-Hinweise wie
 * Kochtipps im Koch-Modus (siehe Regel "Vollfigur nur bei grossen Momenten").
 */
export default function BrutzelAvatar({ size = 28 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="30 30 160 130">
      <Circle cx="108" cy="95" r="42" fill="#F0B87E" stroke="#D89A64" strokeWidth="1.5" />
      <Ellipse cx="108" cy="102" rx="15" ry="11" fill="#E29456" stroke="#C4772E" strokeWidth="1.5" />
      <Circle cx="88" cy="82" r="12" fill="#fff" stroke="#E8DCC8" strokeWidth="1" />
      <Circle cx="128" cy="82" r="12" fill="#fff" stroke="#E8DCC8" strokeWidth="1" />
      <Circle cx="90" cy="85" r="6.5" fill="#3B2412" />
      <Circle cx="130" cy="85" r="6.5" fill="#3B2412" />
      <Path
        d="M78 112 Q88 104 96 110 Q102 106 108 108 Q114 106 120 110 Q128 104 138 112 Q126 116 108 114 Q90 116 78 112 Z"
        fill="#6B4A2E"
      />
      <Ellipse cx="108" cy="126" rx="14" ry="10" fill="#7A2E1D" />
      <Ellipse cx="108" cy="52" rx="36" ry="24" fill="#FFFFFF" stroke="#C9BCA3" strokeWidth="1.8" />
      <Rect x="72" y="56" width="72" height="16" rx="8" fill="#FFFFFF" stroke="#C9BCA3" strokeWidth="1.8" />
    </Svg>
  );
}
