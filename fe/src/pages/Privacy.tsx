/** rag-train-5: what the chat box saves, linked from its notice line (details: docs/rag-training-log.md). */
export function PrivacyPage() {
  return (
    <div className="card narrow">
      <h1>Privacy</h1>
      <h2 id="chat">Chat messages</h2>
      <p>
        To improve our chat assistant we save each question you send it, its answer, which help articles it used, and your thumbs up or
        down. If you are signed in, the chat is linked to your account; guests are identified only by a random code kept in this browser.
      </p>
      <p>
        Our staff may read saved chats to label good and bad answers, and approved examples (without your name, account or code) may be
        used to train the assistant. Chats that nobody reviewed are deleted after 180 days.
      </p>
      <p>
        Tick <strong>Don&apos;t save my chats</strong> under the chat box and your messages are no longer saved. You can still chat as
        before.
      </p>
    </div>
  );
}
