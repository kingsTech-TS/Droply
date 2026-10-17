// Reached only when the service worker isn't installed yet: the shared items can't be kept,
// so open the app normally instead of showing an error.
export function POST(request: Request) {
  return Response.redirect(new URL("/", request.url), 303);
}
