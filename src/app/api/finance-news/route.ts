import { searchSearxng } from '@/lib/searxng';
import { groupSimilarArticles } from '@/lib/utils/articleGrouping';

const financialSources = [
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'marketwatch.com'
];

// Reduce topics to focus on more similar content for testing
const topics = ['finance', 'markets'];

export const GET = async (req: Request) => {
  try {
    console.log('Starting finance news fetch...');
    
    // Fetch articles from multiple sources
    const searchPromises = new Array(financialSources.length)
      .fill(0)
      .map(async (_, i) => {
        const source = financialSources[i];
        // Use a single topic for more focused results
        const topic = topics[0];
        const query = `site:${source} ${topic}`;
        
        console.log(`Fetching from ${source} with topic: ${topic}`);
        try {
          const response = await searchSearxng(query, {
            engines: ['bing news'],
            pageno: 1,
          });
          
          // Get unique articles by URL
          const seenUrls = new Set();
          const uniqueResults = response.results.filter(article => {
            // Normalize URL by removing query parameters and fragments
            const normalizedUrl = new URL(article.url);
            normalizedUrl.search = '';
            normalizedUrl.hash = '';
            const urlKey = normalizedUrl.toString();
            
            if (seenUrls.has(urlKey)) {
              console.log(`Skipping duplicate article URL: ${article.url}`);
              return false;
            }
            seenUrls.add(urlKey);
            return true;
          }).slice(0, 2);

          console.log(`Results from ${source}:`);
          uniqueResults.forEach(article => {
            console.log(`- Title: "${article.title}"`);
            console.log(`  URL: ${article.url}`);
          });
          return uniqueResults;
        } catch (error) {
          console.error(`Error fetching from ${source}:`, error);
          return [];
        }
      });

    const results = await Promise.all(searchPromises);
    const data = results.flat();
    
    console.log(`\nTotal articles fetched: ${data.length}`);

    if (data.length === 0) {
      console.warn('No articles were fetched from any source');
      return Response.json(
        {
          stories: [],
          message: 'No articles found from any source'
        },
        {
          status: 200
        }
      );
    }

    // Map results to include source and ensure content exists
    const articlesWithSource = data.map(article => {
      const url = new URL(article.url);
      // Remove www. from hostname for consistent source matching
      const source = url.hostname.replace(/^www\./, '');
      return {
        ...article,
        source,
        content: article.content || article.title // Fallback to title if no content
      };
    });

    console.log('\nProcessed articles:');
    articlesWithSource.forEach(article => {
      console.log(`- [${article.source}] "${article.title}"`);
      console.log(`  URL: ${article.url}`);
    });

    console.log('\nStarting article grouping and summarization...');

    // Group similar articles
    const groupedArticles = await groupSimilarArticles(articlesWithSource);
    console.log(`Grouping complete. Created ${groupedArticles.length} story groups`);

    return Response.json(
      {
        stories: groupedArticles
      },
      {
        status: 200
      }
    );
  } catch (err) {
    console.error(`An error occurred in finance news route:`, err);
    return Response.json(
      {
        message: 'An error has occurred',
        error: err instanceof Error ? err.message : 'Unknown error'
      },
      {
        status: 500
      }
    );
  }
};