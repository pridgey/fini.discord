export const wizardRespond = async (text: string) => {
  const { LlamaModel, LlamaContext, LlamaChatSession } = await import(
    "node-llama-cpp"
  );

  const model = new LlamaModel({
    modelPath:
      "/home/pridgey/Documents/Code/fini.discord/modules/wizardUncensored/combined_model.bin",
  });
  const context = new LlamaContext({ model });
  const session = new LlamaChatSession({ context });

  const response = await session.prompt(text);

  return response;
};
