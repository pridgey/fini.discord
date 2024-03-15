export const toCapitalize = (str: string) => {
  return `${str.toString().at(0)?.toUpperCase()}${str.substring(1)}`;
};
