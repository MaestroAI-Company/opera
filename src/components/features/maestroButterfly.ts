import { ImageSourcePropType } from "react-native";

export type MaestroButterfly = {
  color: ImageSourcePropType;
  grey: ImageSourcePropType;
};

export type MaestroButterflyId =
  | "cluster"
  | "butterfly2"
  | "butterfly3"
  | "butterfly4";

const butterfly2: MaestroButterfly = {
  color: require("../../../assets/images/butterfly2.png"),
  grey: require("../../../assets/images/butterfly2_grey.png"),
};

export const MAESTRO_BUTTERFLIES: Record<MaestroButterflyId, MaestroButterfly> =
  {
    //still image of the home trio
    cluster: {
      color: require("../../../assets/images/butterfly5.png"),
      grey: require("../../../assets/images/butterfly5_grey.png"),
    },
    butterfly2,
    butterfly3: {
      color: require("../../../assets/images/butterfly3.png"),
      grey: require("../../../assets/images/butterfly3_grey.png"),
    },
    butterfly4: {
      color: require("../../../assets/images/butterfly4.png"),
      grey: require("../../../assets/images/butterfly4_grey.png"),
    },
  };

//maestro config will plug in here
export function useMaestroButterfly(): MaestroButterflyId {
  return "cluster";
}
