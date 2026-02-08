export type AnimeSortOptions =
  | "title"
  | "cheapest"
  | "expensive"
  | "hype"
  | "latest"
  | "oldest";

/**
 * Utility function to determine the PocketBase sort option based on the provided sort string.
 */
export const determineSortOption = (sort?: AnimeSortOptions) => {
  switch (sort) {
    case "title":
      return "title";
    case "cheapest":
      return "initial_stock_price";
    case "expensive":
      return "-initial_stock_price";
    case "hype":
      return "-initial_hype_score";
    case "latest":
      return "-created";
    case "oldest":
      return "created";
    default:
      return "-created"; // Default sort by latest
  }
};
