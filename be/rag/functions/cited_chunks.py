"""rag-train-3: which retrieved chunks the bot's reply cited."""


def cited_chunks(reply, hits):
    """retrieve()'s (score, title, text, chunk_id) hits as rag_retrievals rows {chunkId, rank, score, cited}, best
    first. cited: the reply holds the excerpt's marker, its title in square brackets (prompts/excerpts.md asks for it).
    shortcut: every chunk of one document shares its title, so all of them count as cited; number the excerpts if
    reviewers need per-chunk precision."""
    lowered = (reply or "").lower()
    return [{"chunkId": chunk_id, "rank": rank, "score": float(score), "cited": f"[{title.lower()}]" in lowered}
            for rank, (score, title, _, chunk_id) in enumerate(hits, start=1)]
