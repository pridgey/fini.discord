export const commafyNumber = (num: number) =>
  new Intl.NumberFormat().format(num);
