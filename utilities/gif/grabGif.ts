import fetch from "node-fetch";

export const grabGif = (query: string) => {
  // URL-arize the query param
  const urlarized = encodeURI(query);

  // Fetch a gif from tenor and return a random one
  return fetch(
    `https://g.tenor.com/v1/search?key=${process.env.TENOR_KEY}&q=${urlarized}`
  )
    .then((results) => results.json())
    .then(({ results }) => {
      const gifIndex = Math.round(Math.random() * results.length);
      const { url } = results[gifIndex];
      return url;
    });
};
