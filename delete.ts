import Anthropic from "@anthropic-ai/sdk";

const deleteFile = async () => {
  const anthropic = new Anthropic();

  await anthropic.beta.files.delete("file_011CXpNLuDnjeMK26GXwHZh3");
  await anthropic.beta.files.delete("file_011CXpMhb6LKmt69EfYEwxUU");
  await anthropic.beta.files.delete("file_011CXpMGEnkrh7YmMxzNr4bQ");
  await anthropic.beta.files.delete("file_011CXpMBeHjn2ekmhffq1FhF");
  await anthropic.beta.files.delete("file_011CXpLCuF5DRWunxBhCZMPK");
  await anthropic.beta.files.delete("file_011CXpKzsxqnT1ZGEkEHVcUx");
  await anthropic.beta.files.delete("file_011CXpKkhGGQeVaZkWiotqtx");
  await anthropic.beta.files.delete("file_011CXpKdkG9razAjMnVupLbw");
  await anthropic.beta.files.delete("file_011CXpFzxVicDvGuuMSkXz67");
};

deleteFile();
