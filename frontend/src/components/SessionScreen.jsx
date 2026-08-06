// The two screens that exist because authentication has more than two answers.
//
// Neither is a new design: both reuse the sign-in page's palette (cream page,
// navy ring, gold rule) so they read as the same product at the same moment in
// the same flow. They exist so that "we are still checking" and "we could not
// check" have somewhere to be shown that is not the signed-in interface.

function Frame({ children }) {
  return (
    <div className="min-h-screen bg-[#f7f2e3] flex items-center justify-center px-6">
      <div className="text-center max-w-[420px]">
        <div className="w-[54px] h-[54px] rounded-full border-[3px] border-[#e3b214] flex items-center justify-center text-[#091e47] font-bold text-[22px] mx-auto">A</div>
        {children}
      </div>
    </div>
  )
}

/** Authentication is being resolved. Shown instead of anything authenticated. */
export function CheckingSession() {
  return (
    <Frame>
      <p className="text-[#e3b214] font-bold text-xs tracking-wide mt-6">SECURE ACCESS</p>
      <p className="text-[#0a1733] font-bold text-[22px] mt-2">Checking your session…</p>
      <p className="text-[#5c6b87] text-sm mt-2">Verifying your identity with AI Passport.</p>
      <div className="w-[72px] h-1 rounded-[2px] bg-[#e3b214] mt-6 mx-auto" />
    </Frame>
  )
}

/**
 * The session could not be verified — the service did not answer.
 *
 * Deliberately not "signed in" and deliberately not "signed out": the first
 * would be a claim nothing supports, the second would blame the employee for an
 * outage. It says what is true, and it keeps retrying by itself, so the employee
 * does not have to know to reload.
 */
export function SessionUnavailable({ onRetry }) {
  return (
    <Frame>
      <p className="text-[#b54708] font-bold text-xs tracking-wide mt-6">SESSION UNVERIFIED</p>
      <p className="text-[#0a1733] font-bold text-[22px] mt-2">We can’t verify your session right now</p>
      <p className="text-[#5c6b87] text-sm mt-2">
        AI Passport could not reach the service that confirms who you are, so you are not signed in.
        This retries on its own — or try again below.
      </p>
      <div className="flex gap-3 justify-center mt-6">
        <button
          onClick={onRetry}
          className="bg-[#e3b214] hover:bg-gold-dark text-[#091e47] font-semibold text-sm px-6 h-[46px] rounded-full cursor-pointer"
        >
          Try again
        </button>
        <a
          href="/login"
          className="border-[1.5px] border-[#091e47] text-[#091e47] font-semibold text-sm px-6 h-[46px] rounded-full cursor-pointer flex items-center"
        >
          Go to sign in
        </a>
      </div>
      <p className="text-[#5c6b87] text-xs mt-6">If this continues, contact your organisation administrator.</p>
    </Frame>
  )
}
