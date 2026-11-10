const LOCATION_KEYWORDS = ["맛집", "학원", "식당", "카페", "추천", "극장", "근처"];

export function isLocationMessage(message: string): boolean {
  const lowerQuery = message.toLowerCase();

  return LOCATION_KEYWORDS.some((keyword) => lowerQuery.includes(keyword));
};
