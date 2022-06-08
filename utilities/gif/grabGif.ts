import fetch from "node-fetch";

export const grabGif = (
  query: string,
  engine: "giphy" | "tenor" = "giphy",
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) => {
  // URL-arize the query param
  const urlarized = encodeURI(query);

  const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${urlarized}&rating=${rating}`;
  const tenorUrl = `https://g.tenor.com/v1/search?key=${process.env.TENOR_KEY}&q=${urlarized}`;

  // Fetch a gif from tenor and return a random one
  return fetch(engine === "giphy" ? giphyUrl : tenorUrl)
    .then((results) => results.json())
    .then((data) => {
      const engineDict = {
        giphy: parseGiphyGif,
        tenor: parseTenorGif,
      };

      const result = engineDict[engine](data);

      return result;
    });
};

// Return an array of the gif results
const parseGiphyGif = ({ data }) => data.map((g) => g.images.downsized.url);

// const parseGiphyGif = ({ data }) => data.images.downsized.url;

const parseTenorGif = ({ results }) =>
  results.map((g) => g.media[0].mediumgif.url).filter((g) => g);
