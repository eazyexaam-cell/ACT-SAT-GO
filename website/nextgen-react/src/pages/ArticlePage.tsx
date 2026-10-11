import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { FaqSection } from '../components/FaqSection';
import { NotFoundPage } from './NotFoundPage';
import { ARTICLES, ARTICLE_BY_SLUG, articlePath, formatArticleDate } from '../data/articles';
import { PRIMARY_CTA, SECONDARY_CTA, CONSULT_PATH } from '../site';

/** Long-form article at /resources/:slug, fully server-rendered for search and AI engines. */
export function ArticlePage() {
  const { slug = '' } = useParams();
  const article = ARTICLE_BY_SLUG[slug];
  if (!article) return <NotFoundPage />;

  // Up to 4 other guides, same topic first.
  const others = ARTICLES.filter((a) => a.slug !== article.slug);
  const related = [...others.filter((a) => a.tag === article.tag), ...others.filter((a) => a.tag !== article.tag)].slice(0, 4);

  return (
    <>
      <Header />
      <main className="policy-page article-page">
        <article className="shell policy-shell">
          <nav className="article-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link> <span aria-hidden="true">›</span> <Link to="/resources">Resources</Link>
          </nav>
          <span className="article-tag">{article.tag}</span>
          <h1>{article.title}</h1>
          <p className="policy-updated">
            Last updated: <time dateTime={article.updated}>{formatArticleDate(article.updated)}</time>
          </p>
          <p className="article-answer">{article.answer}</p>

          {article.sections.map((sec) => (
            <section key={sec.heading}>
              <h2>{sec.heading}</h2>
              {sec.paragraphs?.map((p) => <p key={p}>{p}</p>)}
              {sec.table && (
                <div className="article-table-wrap">
                  <table className="article-table">
                    <thead>
                      <tr>{sec.table.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sec.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sec.list && (
                <ul>
                  {sec.list.map((li) => <li key={li}>{li}</li>)}
                </ul>
              )}
            </section>
          ))}

          {article.sources && article.sources.length > 0 && (
            <section className="article-sources">
              <h2>Sources</h2>
              <ul>
                {article.sources.map((src) => (
                  <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a></li>
                ))}
              </ul>
            </section>
          )}

          <aside className="article-cta">
            <p>Not sure where your child stands? Start with a free diagnostic lesson or a free timed practice test.</p>
            <p>
              <Link className="btn btn-primary" to={CONSULT_PATH}>{PRIMARY_CTA}</Link>{' '}
              <Link className="btn" to="/free-test">{SECONDARY_CTA}</Link>
            </p>
          </aside>
        </article>

        <FaqSection items={article.faq} title="Frequently asked questions" />

        {related.length > 0 && (
          <section className="shell policy-shell article-related" aria-labelledby="related-title">
            <h2 id="related-title">More guides</h2>
            <ul>
              {related.map((a) => (
                <li key={a.slug}><Link to={articlePath(a.slug)}>{a.title}</Link></li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
