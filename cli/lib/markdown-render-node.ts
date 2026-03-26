/**
 * OpenTUI {@code MarkdownRenderable} prose blocks normally use Tree-sitter on a merged
 * markdown string; when highlighting fails, raw syntax appears. This module supplies a
 * {@code renderNode} implementation that draws headings, paragraphs, lists, blockquotes,
 * and rules from Marked tokens using {@code TextRenderable} / {@code BoxRenderable},
 * while delegating fenced {@code code} and {@code table} to the default renderer.
 */
import type { Renderable, RenderContext, SyntaxStyle } from "@opentui/core";
import {
  BoxRenderable,
  CodeRenderable,
  RGBA,
  StyledText,
  TextRenderable,
  createTextAttributes,
} from "@opentui/core";
import type { Token, Tokens } from "marked";

/** Matches OpenTUI {@code MarkdownRenderable} {@code RenderNodeContext} for typing the callback. */
export type OpenpawRenderNodeContext = {
  syntaxStyle: SyntaxStyle;
  conceal: boolean;
  concealCode: boolean;
  treeSitterClient?: unknown;
  defaultRender: () => Renderable | null;
};

/** Minimal {@code TextChunk} shape for {@link StyledText} (see OpenTUI text-buffer). */
type MdTextChunk = {
  __isChunk: true;
  text: string;
  fg?: RGBA;
  bg?: RGBA;
  attributes?: number;
  link?: { url: string };
};

/** Terminal palette aligned with {@link ONBOARD}; hex strings are converted to {@link RGBA}. */
export type OpenpawMarkdownPalette = {
  accent: string;
  text: string;
  muted: string;
  hint: string;
  success: string;
  code: string;
  linkUrl: string;
};

/** Builds one styled fragment for {@link StyledText}. */
function makeChunk(
  text: string,
  fg?: RGBA,
  attributes?: number,
  link?: { url: string },
): MdTextChunk {
  return { __isChunk: true, text, fg, attributes, link };
}

type InlineStyle = {
  fg: RGBA;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
};

/** Maps bold/italic/strike flags to OpenTUI text attribute bits. */
function attrsFromStyle(s: InlineStyle): number {
  return createTextAttributes({
    bold: s.bold,
    italic: s.italic,
    strikethrough: s.strikethrough,
  });
}

/**
 * Converts Marked inline {@code tokens} into styled text chunks (conceal mirrors OpenTUI markdown).
 */
function inlineTokensToChunks(
  tokens: Token[] | undefined,
  palette: OpenpawMarkdownPalette,
  conceal: boolean,
  style: InlineStyle,
  chunks: MdTextChunk[],
): void {
  if (!tokens?.length) {
    return;
  }
  const accent = RGBA.fromHex(palette.accent);
  const muted = RGBA.fromHex(palette.muted);
  const codeFg = RGBA.fromHex(palette.code);
  const linkUrlFg = RGBA.fromHex(palette.linkUrl);
  const underline = createTextAttributes({ underline: true });

  for (const tok of tokens) {
    switch (tok.type) {
      case "text":
        chunks.push(
          makeChunk(tok.text, style.fg, attrsFromStyle(style)),
        );
        break;
      case "escape":
        chunks.push(makeChunk(tok.text, style.fg, attrsFromStyle(style)));
        break;
      case "strong":
        inlineTokensToChunks(tok.tokens, palette, conceal, { ...style, bold: true }, chunks);
        break;
      case "em":
        inlineTokensToChunks(tok.tokens, palette, conceal, { ...style, italic: true }, chunks);
        break;
      case "del":
        inlineTokensToChunks(tok.tokens, palette, conceal, { ...style, strikethrough: true }, chunks);
        break;
      case "codespan":
        chunks.push(
          makeChunk(tok.text, codeFg, createTextAttributes({})),
        );
        break;
      case "br":
        chunks.push(makeChunk("\n", style.fg, attrsFromStyle(style)));
        break;
      case "link": {
        const linkTok = tok as Tokens.Link;
        if (conceal) {
          inlineTokensToChunks(linkTok.tokens, palette, conceal, { ...style, fg: accent }, chunks);
          chunks.push(makeChunk(" (", muted, attrsFromStyle({ ...style, fg: muted })));
          chunks.push(
            makeChunk(linkTok.href, linkUrlFg, underline, { url: linkTok.href }),
          );
          chunks.push(makeChunk(")", muted, attrsFromStyle({ ...style, fg: muted })));
        } else {
          chunks.push(makeChunk("[", muted, attrsFromStyle({ ...style, fg: muted })));
          inlineTokensToChunks(linkTok.tokens, palette, conceal, { ...style, fg: accent }, chunks);
          chunks.push(makeChunk("](", muted, attrsFromStyle({ ...style, fg: muted })));
          chunks.push(
            makeChunk(linkTok.href, linkUrlFg, underline, { url: linkTok.href }),
          );
          chunks.push(makeChunk(")", muted, attrsFromStyle({ ...style, fg: muted })));
        }
        break;
      }
      case "image": {
        const img = tok as Tokens.Image;
        const label = img.text || "image";
        if (conceal) {
          chunks.push(
            makeChunk(label, accent, underline, { url: img.href }),
          );
        } else {
          chunks.push(makeChunk("![", muted, attrsFromStyle({ ...style, fg: muted })));
          chunks.push(makeChunk(label, style.fg, attrsFromStyle(style)));
          chunks.push(makeChunk("](", muted, attrsFromStyle({ ...style, fg: muted })));
          chunks.push(
            makeChunk(img.href, linkUrlFg, underline, { url: img.href }),
          );
          chunks.push(makeChunk(")", muted, attrsFromStyle({ ...style, fg: muted })));
        }
        break;
      }
      default:
        if ("tokens" in tok && Array.isArray(tok.tokens)) {
          inlineTokensToChunks(tok.tokens as Token[], palette, conceal, style, chunks);
        } else if ("text" in tok && typeof (tok as Tokens.Text).text === "string") {
          chunks.push(
            makeChunk((tok as Tokens.Text).text, style.fg, attrsFromStyle(style)),
          );
        }
        break;
    }
  }
}

/** Inline Marked tokens as {@link StyledText} with the given base foreground color. */
function styledParagraphContent(
  tokens: Token[] | undefined,
  palette: OpenpawMarkdownPalette,
  conceal: boolean,
  baseFg: RGBA,
): StyledText {
  const chunks: MdTextChunk[] = [];
  inlineTokensToChunks(tokens, palette, conceal, { fg: baseFg }, chunks);
  if (chunks.length === 0) {
    return new StyledText([makeChunk(" ", baseFg)]);
  }
  return new StyledText(chunks);
}

/** Normalizes fenced-block language tags for {@link CodeRenderable} filetype. */
function mapCodeLang(lang?: string): string {
  const l = (lang ?? "").trim().toLowerCase();
  if (!l) {
    return "text";
  }
  return l;
}

/**
 * Builds the {@code renderNode} callback for {@code <markdown>}; keeps Tree-sitter for
 * fenced code blocks and tables only.
 */
export function createOpenpawMarkdownRenderNode(palette: OpenpawMarkdownPalette) {
  let ctxCache: RenderContext | null = null;
  let idSeq = 0;
  const nextId = (kind: string) => `openpaw-md-${kind}-${++idSeq}`;

  /** Obtains {@link RenderContext} once via a throwaway default code renderable. */
  function resolveCtx(context: OpenpawRenderNodeContext): RenderContext {
    if (ctxCache) {
      return ctxCache;
    }
    const probe = context.defaultRender();
    if (!probe) {
      throw new Error("openpaw markdown: defaultRender() returned null (cannot obtain RenderContext)");
    }
    const nextCtx = probe.ctx;
    probe.destroyRecursively();
    ctxCache = nextCtx;
    return nextCtx;
  }

  /** Renders a vertical stack of block tokens (e.g. inside a blockquote). */
  function renderBlockChildren(
    ctx: RenderContext,
    context: OpenpawRenderNodeContext,
    tokens: Token[],
    marginBottom: number,
  ): Renderable {
    const col = new BoxRenderable(ctx, {
      id: nextId("col"),
      flexDirection: "column",
      gap: 0,
      width: "100%",
      marginBottom,
    });
    for (const t of tokens) {
      if (t.type === "space") {
        continue;
      }
      const inner = renderBlock(ctx, context, t, 0);
      if (inner) {
        col.add(inner);
      }
    }
    return col;
  }

  /** Paragraph block as wrapped styled text. */
  function renderParagraphBox(
    ctx: RenderContext,
    tok: Tokens.Paragraph,
    context: OpenpawRenderNodeContext,
    marginBottom: number,
  ): Renderable {
    const base = RGBA.fromHex(palette.text);
    const styled = styledParagraphContent(tok.tokens, palette, context.conceal, base);
    return new TextRenderable(ctx, {
      id: nextId("p"),
      width: "100%",
      wrapMode: "word",
      marginBottom,
      content: styled,
    });
  }

  /** ATX heading with depth-based color and bold body text. */
  function renderHeadingBox(
    ctx: RenderContext,
    tok: Tokens.Heading,
    context: OpenpawRenderNodeContext,
    marginBottom: number,
  ): Renderable {
    const fgHex = tok.depth <= 3 ? palette.accent : palette.muted;
    const fg = RGBA.fromHex(fgHex);
    const styled = styledParagraphContent(tok.tokens, palette, context.conceal, fg);
    return new TextRenderable(ctx, {
      id: nextId("h"),
      width: "100%",
      wrapMode: "word",
      marginBottom,
      content: styled,
      attributes: createTextAttributes({ bold: true }),
    });
  }

  /** Thematic break as a bottom border strip. */
  function renderHr(ctx: RenderContext, marginBottom: number): Renderable {
    return new BoxRenderable(ctx, {
      id: nextId("hr"),
      width: "100%",
      marginBottom,
      border: ["bottom"],
      borderStyle: "single",
      borderColor: RGBA.fromHex(palette.hint),
      minHeight: 1,
    });
  }

  /** Blockquote with left border and nested blocks. */
  function renderBlockquoteBox(
    ctx: RenderContext,
    tok: Tokens.Blockquote,
    context: OpenpawRenderNodeContext,
    marginBottom: number,
  ): Renderable {
    const inner = renderBlockChildren(ctx, context, tok.tokens, 0);
    const wrap = new BoxRenderable(ctx, {
      id: nextId("bq"),
      flexDirection: "row",
      width: "100%",
      marginBottom,
      border: ["left"],
      borderStyle: "single",
      borderColor: RGBA.fromHex(palette.hint),
      paddingLeft: 1,
    });
    wrap.add(inner);
    return wrap;
  }

  /** Ordered or unordered list as a column of items. */
  function renderListBox(
    ctx: RenderContext,
    tok: Tokens.List,
    context: OpenpawRenderNodeContext,
    marginBottom: number,
  ): Renderable {
    const col = new BoxRenderable(ctx, {
      id: nextId("ul"),
      flexDirection: "column",
      gap: 0,
      width: "100%",
      marginBottom,
    });
    let index = typeof tok.start === "number" ? tok.start : 1;
    for (const item of tok.items) {
      col.add(renderListItem(ctx, tok, item, context, index));
      if (tok.ordered) {
        index += 1;
      }
    }
    return col;
  }

  /** One list row: marker column plus body blocks. */
  function renderListItem(
    ctx: RenderContext,
    list: Tokens.List,
    item: Tokens.ListItem,
    context: OpenpawRenderNodeContext,
    ordinal: number,
  ): Renderable {
    const listFg = RGBA.fromHex(palette.success);
    const bullet =
      item.task === true
        ? item.checked
          ? "[x] "
          : "[ ] "
        : list.ordered
          ? `${ordinal}. `
          : "• ";
    const row = new BoxRenderable(ctx, {
      id: nextId("li-row"),
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 0,
      width: "100%",
    });
    const mark = new TextRenderable(ctx, {
      id: nextId("li-mark"),
      content: bullet,
      fg: listFg,
      wrapMode: "none",
    });
    const body = new BoxRenderable(ctx, {
      id: nextId("li-body"),
      flexDirection: "column",
      flexGrow: 1,
      gap: 0,
      width: "100%",
    });
    for (const t of item.tokens) {
      if (t.type === "space") {
        continue;
      }
      const block = renderBlockInList(ctx, context, t);
      if (block) {
        body.add(block);
      }
    }
    row.add(mark);
    row.add(body);
    return row;
  }

  /** Block token inside a list item (paragraph, nested list, code, etc.). */
  function renderBlockInList(ctx: RenderContext, context: OpenpawRenderNodeContext, token: Token): Renderable | null {
    if (token.type === "paragraph") {
      return renderParagraphBox(ctx, token as Tokens.Paragraph, context, 0);
    }
    if (token.type === "list") {
      return renderListBox(ctx, token as Tokens.List, context, 0);
    }
    if (token.type === "blockquote") {
      return renderBlockquoteBox(ctx, token as Tokens.Blockquote, context, 0);
    }
    if (token.type === "code") {
      const codeTok = token as Tokens.Code;
      return new CodeRenderable(ctx, {
        id: nextId("code-nested"),
        content: codeTok.text,
        filetype: mapCodeLang(codeTok.lang),
        syntaxStyle: context.syntaxStyle,
        width: "100%",
        marginBottom: 0,
        conceal: context.concealCode,
        streaming: false,
      });
    }
    if (token.type === "heading") {
      return renderHeadingBox(ctx, token as Tokens.Heading, context, 0);
    }
    if (token.type === "text") {
      const t = token as Tokens.Text;
      const styled = styledParagraphContent(t.tokens ?? [], palette, context.conceal, RGBA.fromHex(palette.text));
      return new TextRenderable(ctx, {
        id: nextId("li-fallback"),
        width: "100%",
        wrapMode: "word",
        content: t.text.length > 0 && (!t.tokens || t.tokens.length === 0) ? t.text : styled,
      });
    }
    if (token.type === "html") {
      const htmlTok = token as Tokens.HTML;
      return new TextRenderable(ctx, {
        id: nextId("li-html"),
        width: "100%",
        wrapMode: "word",
        content: htmlTok.text,
        fg: RGBA.fromHex(palette.muted),
      });
    }
    return renderBlock(ctx, context, token, 0);
  }

  /** Standalone {@code text} token at document level. */
  function renderTopLevelText(
    ctx: RenderContext,
    tok: Tokens.Text,
    context: OpenpawRenderNodeContext,
  ): Renderable {
    const styled = styledParagraphContent(tok.tokens ?? [], palette, context.conceal, RGBA.fromHex(palette.text));
    const content =
      tok.text.length > 0 && (!tok.tokens || tok.tokens.length === 0) ? tok.text : styled;
    return new TextRenderable(ctx, {
      id: nextId("text"),
      width: "100%",
      wrapMode: "word",
      marginBottom: 0,
      content,
    });
  }

  /** Top-level block types handled without Tree-sitter markdown. */
  function renderBlock(
    ctx: RenderContext,
    context: OpenpawRenderNodeContext,
    token: Token,
    marginBottom: number,
  ): Renderable | null {
    switch (token.type) {
      case "paragraph":
        return renderParagraphBox(ctx, token as Tokens.Paragraph, context, marginBottom);
      case "heading":
        return renderHeadingBox(ctx, token as Tokens.Heading, context, marginBottom);
      case "blockquote":
        return renderBlockquoteBox(ctx, token as Tokens.Blockquote, context, marginBottom);
      case "list":
        return renderListBox(ctx, token as Tokens.List, context, marginBottom);
      case "hr":
        return renderHr(ctx, marginBottom);
      case "text":
        return renderTopLevelText(ctx, token as Tokens.Text, context);
      default:
        return null;
    }
  }

  /** OpenTUI {@code renderNode} callback: custom prose, default code/tables. */
  return function openpawMarkdownRenderNode(
    token: Token,
    context: OpenpawRenderNodeContext,
  ): Renderable | undefined | null {
    if (token.type === "code" || token.type === "table") {
      return context.defaultRender();
    }
    const ctx = resolveCtx(context);
    const rendered = renderBlock(ctx, context, token, 1);
    if (rendered) {
      return rendered;
    }
    return context.defaultRender();
  };
}
