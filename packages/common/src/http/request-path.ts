export const pathWithoutQuery = (url: string): string => {
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
};
