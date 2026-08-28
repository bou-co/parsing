import { initializeParser } from '../../parser';
import { html, markdown, markedAdapter, sanitizeHtmlAdapter, ultrahtmlAdapter, toPlainText, type SanitiserAdapter } from '../content';

/** Behaviour both shipped sanitiser adapters must share — the security floor for zero-config use */
const describeSanitiser = (name: string, adapter: SanitiserAdapter<unknown>) => {
  describe(`${name} adapter`, () => {
    const safe = html(adapter);
    const cast = (value: string) => safe.cast(value) as Promise<string>;

    it('keeps ordinary rich text', async () => {
      const out = await cast('<p>Hello <b>world</b>, <em>welcome</em> <a href="https://example.com/x?a=1">here</a>.</p>');
      expect(out).toContain('<b>world</b>');
      expect(out).toContain('<em>welcome</em>');
      expect(out).toContain('href="https://example.com/x?a=1"');
    });

    it('drops scripts, styles, iframes and objects entirely', async () => {
      const out = await cast('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://evil"></iframe><object data="x"></object><p>b</p>');
      expect(out).not.toMatch(/script|alert|style|iframe|object|evil/);
      expect(out).toContain('<p>a</p>');
      expect(out).toContain('<p>b</p>');
    });

    it('drops event handlers and javascript: URLs', async () => {
      const out = await cast('<img src="x" onerror="alert(1)"><a href="javascript:alert(1)" onclick="x()">link</a><div onmouseover="y()">t</div>');
      expect(out).not.toMatch(/onerror|onclick|onmouseover|javascript:|alert/);
      expect(out).toContain('link');
    });

    it('drops form elements and metadata', async () => {
      const out = await cast('<form action="/steal"><input name="pw"><button>go</button></form><link rel="x"><meta charset="x"><base href="https://evil/">');
      expect(out).not.toMatch(/form|input|button|<link|<meta|<base|evil|steal/);
    });

    it('strips to plain text with .plain', async () => {
      expect(await safe.plain.cast('<p>Hello <b>world</b></p><p>Bye &amp; thanks</p><script>x</script>')).toEqual('Hello world\nBye & thanks');
    });
  });
};

describe('content types', () => {
  describeSanitiser('sanitize-html', sanitizeHtmlAdapter());
  describeSanitiser('ultrahtml', ultrahtmlAdapter());

  it('passes adapter options straight through', async () => {
    const strict = html(sanitizeHtmlAdapter({ allowedTags: ['p'] }));
    expect(await strict.cast('<p>a <b>b</b></p>')).toEqual('<p>a b</p>');
    const light = html(ultrahtmlAdapter({ allowElements: ['p'] }));
    expect(await light.cast('<p>a <b>b</b></p><div>c</div>')).toEqual('<p>a </p>');
  });

  it('markdown renders and always sanitises, with a test for embedded raw HTML', async () => {
    const md = markdown(markedAdapter(), sanitizeHtmlAdapter());
    const out = (await md.cast(
      '# Title\n\nHello **world**\n\n<script>alert(1)</script><img src=x onerror="alert(2)">\n\n[link](javascript:alert(3))',
    )) as string;
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>world</strong>');
    expect(out).not.toMatch(/script|alert|onerror|javascript:/);
    expect(await md.plain.cast('# Title\n\nHello **world**')).toEqual('Title\nHello world');
    const light = markdown(markedAdapter(), ultrahtmlAdapter(), { parser: { breaks: true } });
    expect(await light.cast('a\nb <script>x</script>')).toEqual('<p>a<br>b </p>\n');
  });

  it('works in projections, as pipes and with defaults', async () => {
    const { createParser } = initializeParser({
      types: { html: html(sanitizeHtmlAdapter()), markdown: markdown(markedAdapter(), sanitizeHtmlAdapter()) },
      variables: { body: '**hi** <script>x</script>' },
    });
    const parser = createParser({
      body: html(ultrahtmlAdapter()).default('<p>—</p>'),
      preview: html(ultrahtmlAdapter()).plain.truncate(8),
      md: '{{ body | markdown }}',
      plain: '{{ body | markdown.plain }}',
    });
    expect(await parser({ preview: '<p>Hello there world</p>' })).toEqual({
      body: '<p>—</p>',
      preview: 'Hello t…',
      md: '<p><strong>hi</strong> </p>\n',
      plain: 'hi',
    });
  });

  it('reports a missing peer package with an actionable error', async () => {
    const broken = html({ name: 'x', package: 'not-installed-sanitizer', load: () => import('not-installed-sanitizer' as string), sanitize: () => '' });
    await expect(async () => broken.cast('<p>x</p>')).rejects.toThrow('Cannot find');
    const { createLoader } = await import('./adapters');
    const load = createLoader('some-sanitizer', 'html', () => import('some-sanitizer' as string));
    await expect(load()).rejects.toThrow('The "html" type needs the "some-sanitizer" package — install it with `npm i some-sanitizer`');
    expect(() => html(undefined as never)).toThrow('a sanitiser adapter is required');
    expect(() => markdown(markedAdapter(), undefined as never)).toThrow('Markdown output is always sanitised');
  });

  it('toPlainText handles entities and block breaks', () => {
    expect(toPlainText('<h1>A</h1><p>b&nbsp;c &lt;d&gt;</p><ul><li>x</li><li>y</li></ul>')).toEqual('A\nb c <d>\nx\ny');
  });
});
