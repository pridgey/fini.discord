import { parse } from "date-fns";

/**
 * Utility function to determine if a date is a valid date object
 * @param date The date object to check
 * @returns boolean determining validity of date
 */
export const isDateValid = (date: Date) => {
  return !isNaN(date.valueOf());
};

/**
 * Utility function to try and parse a string of unknown format to a date
 * @param dateString The date string to try and parse
 * @returns Either the parsed Date object, or null
 */
export const tryParseDate = (dateString: string) => {
  // Trim input and convert time terms like 'midnight' or 'noon'
  const cleanedInput = dateString
    .trim()
    .toLowerCase()
    .replace(/midnight/, "am")
    .replace(/midday|noon/, "pm");

  // Common date formats
  const dateFormats = [
    // U.S. standard formats
    "M/d/yyyy",
    "MM/dd/yyyy",
    "M/d/yy",
    "MM/dd/yy",
    // U.S. formats with named months
    "MMMM d, yyyy",
    "MMMM d, yy",
    "MMM d, yyyy",
    "MMM d, yy",
    // U.K. and European standard formats
    "d/M/yyyy",
    "dd/MM/yyyy",
    "d/M/yy",
    "dd/MM/yy",
    // U.K. and European formats with named months
    "d MMMM yyyy",
    "d MMM yyyy",
    "dd MMMM yyyy",
    "dd MMM yyyy",
    // ISO 8601 formats
    "yyyy-MM-dd",
    "yy-MM-dd",
    // Extended formats with time
    "M/d/yyyy HH:mm",
    "MM/dd/yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "yyyy-MM-dd HH:mm:ss",
    "d MMM yyyy HH:mm",
    // Additional variants with named months
    "d MMMM, yyyy",
    "MMMM d",
    "MMM d, yyyy",
    "d MMM, yy",
    // Formats with ordinal day
    "do MMM yyyy",
    "MMMM do yy",
    "MMMM do, yyyy",
    "do MMM yy",
    // Time formats with 12-hour clock
    "M/d/yyyy hh:mm a",
    "dd/MM/yyyy hh:mm a",
    "M/d/yy hh:mm a",
    "dd/MM/yy hh:mm a",
    // Additional
    "M/dd/yy h:mm a",
    "M/dd/yy h:mm aa",
    "M/dd/yy h:mma",
    "M/dd/yy h:mmaa",
    "M/d/yy h:mma",
    "M/d/yy h:mmaa",
  ];

  let parsedDate: Date;

  // Try to parse the date
  parsedDate = new Date(cleanedInput);

  if (isDateValid(parsedDate)) {
    // That worked
    return parsedDate;
  }

  // Try formatting with the regex patterns
  for (const format of dateFormats) {
    parsedDate = parse(cleanedInput, format, new Date());
    if (isDateValid(parsedDate)) {
      return parsedDate;
    }
  }

  // None of those worked
  return null;
};
