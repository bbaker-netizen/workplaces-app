/**
 * The endpoint every EA approve link lands on.
 *
 * No Clerk session. The token in the URL is the credential, which is the
 * whole point: an approval that requires sitting at a desk does not
 * happen, and an unapproved recap ages badly.
 *
 * **Two steps, on purpose.** GET peeks at the token and renders "here is
 * what this will do" with a POST button; POST consumes the token and
 * acts. Mail security scanners (Outlook Safe Links, Gmail's link
 * checker, corporate proxies) fetch the URLs in a message before a human
 * sees them. If GET performed the action, a scanner would burn the
 * single-use token — and for a session recap it would email a client
 * under Bruce's name with nobody having clicked. Two taps from a phone
 * is a small price for that not being possible.
 *
 * Both verbs return standalone HTML rather than JSON: this is opened in
 * a mail app's browser, and it needs to read as a finished page.
 */

import { NextResponse } from "next/server";
import {
  confirmPage,
  errorPage,
  successPage,
  tokenFailureCopy,
} from "@/lib/ea/approval-page";
import {
  acceptAgendaProposal,
  describeAgendaProposal,
} from "@/lib/ea/agenda-draft";
import { approveSessionRecap, describeRecap } from "@/lib/ea/session-recap";
import { approveTimeBlock, describeTimeBlock } from "@/lib/ea/time-blocks";
import { consumeApprovalToken, peekApprovalToken } from "@/lib/ea/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never let a proxy or the browser keep an approval page around.
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-robots-tag": "noindex, nofollow",
      // Keep the token out of the Referer header on any onward navigation.
      "referrer-policy": "no-referrer",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const peek = await peekApprovalToken(params.token);
  if (!peek.ok) {
    const copy = tokenFailureCopy(peek.reason);
    return html(errorPage(copy.heading, copy.detail), 410);
  }

  if (peek.token.subjectType === "time_block") {
    const block = await describeTimeBlock(peek.token.subjectId);
    if (!block) {
      return html(
        errorPage(
          "That block is gone",
          "The commitment it belonged to may have been deleted.",
        ),
        404,
      );
    }
    if (block.status !== "proposed") {
      return html(
        errorPage(
          "Already actioned",
          `This block is ${block.status}. Nothing further has changed.`,
        ),
        409,
      );
    }
    return html(
      confirmPage({
        heading: "Put this on your calendar?",
        detail: `${block.title}, ${block.whenLabel}. This creates one event in your Google Calendar and nothing else.`,
        buttonLabel: "Yes, book it",
      }),
    );
  }

  if (peek.token.subjectType === "agenda_proposal") {
    const proposal = await describeAgendaProposal(peek.token.subjectId);
    if (!proposal) {
      return html(
        errorPage("That agenda is gone", "The session may have been deleted."),
        404,
      );
    }
    if (proposal.status !== "proposed") {
      return html(
        errorPage(
          "Already actioned",
          `That agenda has already been ${proposal.status}.`,
        ),
        409,
      );
    }
    const list = proposal.items
      .map(
        (i) =>
          `<li style="margin:0 0 8px 0;">${i.title.replace(/[<>&"]/g, "")}${
            i.body
              ? `<br><span style="color:#666666;font-size:13px;">${i.body.replace(/[<>&"]/g, "")}</span>`
              : ""
          }</li>`,
      )
      .join("");
    return html(
      confirmPage({
        heading: "Add these to the agenda?",
        detail:
          "This adds them as agenda items on the session, after anything already there. They become visible to the client, and you can edit or delete any of them afterwards.",
        buttonLabel: "Add to the agenda",
        previewHtml: `<ol style="margin:0;padding-left:20px;">${list}</ol>`,
      }),
    );
  }

  const recap = await describeRecap(peek.token.subjectId);
  if (!recap) {
    return html(errorPage("That recap is gone", "It may have been deleted."), 404);
  }
  if (recap.status !== "draft") {
    return html(
      errorPage(
        "Already actioned",
        `This recap is ${recap.status}. It has not been sent twice.`,
      ),
      409,
    );
  }
  return html(
    confirmPage({
      heading: `Send this recap to ${recap.clientLabel}?`,
      // The recipient count is stated up front because zero is both
      // common and silent: a client nobody has invited to their portal
      // yet has no contacts to email, so approving would file the record
      // and send nothing. Discovering that afterwards is how a coach
      // believes a client was written to when they were not.
      detail:
        recap.recipientCount > 0
          ? `This emails the recap to ${recap.recipientCount} contact${recap.recipientCount === 1 ? "" : "s"} at ${recap.clientLabel} and files it on their portal thread as a permanent record. Read it through first.`
          : `Nobody at ${recap.clientLabel} has been invited to their portal yet, so approving will file this on their portal thread but email no one. Invite them first if you want them to receive it.`,
      buttonLabel:
        recap.recipientCount > 0 ? "Approve and send" : "File it anyway",
      previewHtml: recap.bodyHtml,
    }),
  );
}

export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const consumed = await consumeApprovalToken(params.token);
  if (!consumed.ok) {
    const copy = tokenFailureCopy(consumed.reason);
    return html(errorPage(copy.heading, copy.detail), 410);
  }

  const { subjectType, subjectId, userProfileId } = consumed.token;

  if (subjectType === "time_block") {
    const result = await approveTimeBlock(subjectId);
    if (!result.ok) {
      return html(errorPage("Could not book it", result.reason), 409);
    }
    const block = await describeTimeBlock(subjectId);
    return html(
      successPage(
        "Booked",
        `${result.title} is on your calendar${block ? `, ${block.whenLabel}` : ""}. Mark the item done and the block clears itself.`,
      ),
    );
  }

  if (subjectType === "agenda_proposal") {
    const accepted = await acceptAgendaProposal(subjectId, userProfileId);
    if (!accepted.ok) {
      return html(errorPage("Could not add them", accepted.reason), 409);
    }
    return html(
      successPage(
        "On the agenda",
        `${accepted.added} talking point${accepted.added === 1 ? "" : "s"} added to the session. Edit or reorder them in the app whenever you like.`,
      ),
    );
  }

  const result = await approveSessionRecap(subjectId, userProfileId);
  if (!result.ok) {
    return html(errorPage("Could not send it", result.reason), 409);
  }
  // The heading tells the truth about what happened. "Sent" over a recap
  // that reached nobody is the kind of false confirmation that only
  // surfaces weeks later, when a client mentions they never saw it.
  return html(
    successPage(
      result.sentTo > 0 ? "Sent" : "Filed, not sent",
      result.sentTo > 0
        ? `The recap has gone to ${result.sentTo} contact${result.sentTo === 1 ? "" : "s"} at ${result.clientLabel} and is filed on their portal thread.`
        : `The recap is filed on ${result.clientLabel}'s portal thread, but nobody was emailed — no one at ${result.clientLabel} has a portal account with a usable address. Invite them, then send it from the session in the app.`,
    ),
  );
}
