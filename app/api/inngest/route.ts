import {inngest} from "@/lib/inngest/client";
import {sendSignUpEmail} from "@/app/api/inngest/functions";
import {serve} from "inngest/next";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [sendSignUpEmail],
})