//whisper model binary assets
declare module "*.bin" {
  const value: number;
  export default value;
}

declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";
  const content: FC<SvgProps>;
  export default content;
}
