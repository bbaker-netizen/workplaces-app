/**
 * Inngest mount — exposes registered functions for Inngest cloud
 * to invoke.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { allFunctions } from "@/lib/inngest/functions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = serve({ client: inngest, functions: allFunctions });

export const { GET, POST, PUT } = handlers;
