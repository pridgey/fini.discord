export type AnimeSortOptions =
  | "title"
  | "cheapest"
  | "expensive"
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
      return "latest_price";
    case "expensive":
      return "-latest_price";
    case "latest":
      return "-created";
    case "oldest":
      return "created";
    default:
      return "-created"; // Default sort by latest
  }
};
