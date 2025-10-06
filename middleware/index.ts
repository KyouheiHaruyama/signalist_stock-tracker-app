import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
    const sessionCookie = getSessionCookie(request);

    // This is Not Secure!
    // This is the recommended approach to optimistically redirect users
    // We recommend handling auth checks in each page/route

    if (!sessionCookie) return NextResponse.redirect(new URL('/', request.url));

    return NextResponse.next();
}

export const config = {
    matcher: '/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up|assets).*)/'
}

// export const config = {
//     matcher: ["/dashboard"]     // Specify the routes the middleware applies to
// };