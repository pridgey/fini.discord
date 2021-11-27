export const callAndResponse = (call: string) => {
  // A dictionary of calls and responses
  const dict: { [key: string]: string } = {
    "good bot": "=D",
    "i don't want no scrub": "a scrub is a guy who can't get no love from me",
  };

  // If we know what it is, return it
  if (call in dict) {
    return dict[call];
  }

  return undefined;
};
