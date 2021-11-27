import brain from "brain.js";
import * as model from "./../../../ml-models/model.json";
import { stringReturn } from "./../../../utilities";

export const runTranslate = () => (args: string[]) => {
  const textToTranslate = args.join(" ");

  const net = new brain.recurrent.LSTM();
  net.fromJSON(model as unknown as brain.INeuralNetworkJSON);

  const result = net.run(textToTranslate).toLowerCase();

  return stringReturn(
    `${result.substring(0, 1).toUpperCase()}${result.substring(1)}` ||
      "That had no translation :("
  );
};
