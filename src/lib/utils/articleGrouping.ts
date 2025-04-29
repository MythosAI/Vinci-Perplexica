import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import computeSimilarity from '@/lib/utils/computeSimilarity';
import prompts from '@/lib/prompts';
import { getOpenaiApiKey } from '@/lib/config';

interface NewsArticle {
  title: string;
  content: string;
  url: string;
  thumbnail?: string;
  source: string;
  publishDate?: string;
}

interface GroupedStory {
  mainTitle: string;
  summary: string;
  keyPoints: string[];
  articles: NewsArticle[];
  bias: {
    left: number;
    center: number;
    right: number;
  };
}

// Map of news sources to their bias ratings
const sourceBiasMap: Record<string, 'left' | 'center' | 'right'> = {
  'reuters.com': 'center',
  'bloomberg.com': 'center',
  'wsj.com': 'right',
  'ft.com': 'center',
  'cnbc.com': 'center',
  'foxbusiness.com': 'right',
  'marketwatch.com': 'center',
  'businessinsider.com': 'left',
  'forbes.com': 'center',
  'thestreet.com': 'center'
};

async function generateSummary(articles: NewsArticle[]): Promise<string> {
  console.log('Starting summary generation...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });
  
  console.log('Sending request to OpenAI for summary...');
  const result = await llm.invoke(
    prompts.financeNewsSummaryPrompt.replace(
      '{context}',
      articles.map(a => `${a.title}\n${a.content}`).join('\n\n')
    ).replace(
      '{date}',
      new Date().toISOString()
    )
  );
  
  console.log('Summary generation complete');
  return result.content as string;
}

async function extractKeyPoints(articles: NewsArticle[]): Promise<string[]> {
  console.log('Starting key points extraction...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });
  
  console.log('Sending request to OpenAI for key points...');
  const result = await llm.invoke(
    prompts.financeNewsKeyPointsPrompt.replace(
      '{context}',
      articles.map(a => `${a.title}\n${a.content}`).join('\n\n')
    )
  );
  
  // Split the content into lines and extract bullet points
  const keyPoints = (result.content as string)
    .split('\n')
    .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
    .map(line => line.trim().replace(/^[•-]\s*/, ''));
  
  console.log('Key points extraction complete');
  return keyPoints;
}

function getMostRepresentativeTitle(articles: NewsArticle[]): string {
  // Get the longest title as it's likely to be most descriptive
  return articles.reduce((longest, article) => 
    article.title.length > longest.length ? article.title : longest
  , articles[0].title);
}

function calculateBias(articles: NewsArticle[]): { left: number; center: number; right: number } {
  const biasCount = {
    left: 0,
    center: 0,
    right: 0
  };
  
  let totalSources = 0;
  
  articles.forEach(article => {
    const domain = new URL(article.url).hostname.replace('www.', '');
    const bias = sourceBiasMap[domain];
    
    if (bias) {
      biasCount[bias]++;
      totalSources++;
    }
  });
  
  // Convert to percentages
  return {
    left: Math.round((biasCount.left / totalSources) * 100) || 0,
    center: Math.round((biasCount.center / totalSources) * 100) || 0,
    right: Math.round((biasCount.right / totalSources) * 100) || 0
  };
}

export async function groupSimilarArticles(articles: NewsArticle[]): Promise<GroupedStory[]> {
  console.log('Starting article grouping process...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  // Debug: Log all articles and their sources first
  console.log('All articles before grouping:');
  articles.forEach((article, idx) => {
    console.log(`${idx}: [${article.source}] "${article.title}" URL: ${article.url}`);
  });

  console.log('Initializing OpenAI embeddings...');
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: openaiApiKey,
    modelName: 'text-embedding-3-small'
  });
  const groups: GroupedStory[] = [];
  const processedArticles = new Set();

  console.log('Generating embeddings for article titles...');
  // Get embeddings for all article titles
  const titleEmbeddings = await embeddings.embedDocuments(
    articles.map(article => article.title)
  );
  console.log(`Generated embeddings for ${titleEmbeddings.length} articles`);

  // Group similar articles based on title similarity
  console.log('Starting similarity comparison...');
  for (let i = 0; i < articles.length; i++) {
    if (processedArticles.has(i)) {
      console.log(`Skipping article ${i} as it's already processed`);
      continue;
    }

    const currentArticle = articles[i];
    console.log(`\nProcessing article ${i}: [${currentArticle.source}] "${currentArticle.title}"`);
    
    const similarArticles = [currentArticle];
    const usedSources = new Set([currentArticle.source]);
    const usedUrls = new Set([currentArticle.url]);
    processedArticles.add(i);

    // Find similar articles from different sources
    for (let j = i + 1; j < articles.length; j++) {
      if (processedArticles.has(j)) {
        console.log(`Skipping comparison article ${j} as it's already processed`);
        continue;
      }
      
      const comparisonArticle = articles[j];
      
      // Skip if URLs are identical (exact same article)
      if (usedUrls.has(comparisonArticle.url)) {
        console.log(`Skipping article ${j} - duplicate URL`);
        continue;
      }

      // Skip if we already have an article from this source
      if (usedSources.has(comparisonArticle.source)) {
        console.log(`Skipping article ${j} - already have article from source ${comparisonArticle.source}`);
        continue;
      }

      const similarity = computeSimilarity(titleEmbeddings[i], titleEmbeddings[j]);
      console.log(`Comparing with article ${j}:`);
      console.log(`- Source: ${comparisonArticle.source}`);
      console.log(`- Title: "${comparisonArticle.title}"`);
      console.log(`- URL: ${comparisonArticle.url}`);
      console.log(`- Similarity: ${similarity}`);
      
      if (similarity > 0.80) {
        console.log(`Adding article ${j} to group (similarity: ${similarity})`);
        similarArticles.push(comparisonArticle);
        usedSources.add(comparisonArticle.source);
        usedUrls.add(comparisonArticle.url);
        processedArticles.add(j);
      } else {
        console.log(`Skipping article ${j} - similarity too low (${similarity})`);
      }
    }

    // Only create a group if we have articles from different sources
    if (similarArticles.length > 1 && usedSources.size > 1) {
      console.log(`\nFound group of ${similarArticles.length} similar articles from ${usedSources.size} different sources:`);
      similarArticles.forEach(article => {
        console.log(`- [${article.source}] "${article.title}"`);
        console.log(`  URL: ${article.url}`);
      });
      
      // Generate summary and key points using LLM
      console.log('Generating summary for group...');
      const summary = await generateSummary(similarArticles);
      console.log('Summary generated:', summary);

      console.log('Extracting key points...');
      const keyPoints = await extractKeyPoints(similarArticles);
      console.log('Key points extracted:', keyPoints);
      
      groups.push({
        mainTitle: getMostRepresentativeTitle(similarArticles),
        summary,
        keyPoints,
        articles: similarArticles,
        bias: calculateBias(similarArticles)
      });
      console.log('Group processed successfully');
    } else {
      console.log(`\nSkipping group creation:`);
      console.log(`- Number of articles: ${similarArticles.length}`);
      console.log(`- Number of unique sources: ${usedSources.size}`);
      console.log(`- Sources: ${[...usedSources].join(', ')}`);
    }
  }

  console.log(`\nArticle grouping complete. Created ${groups.length} story groups`);
  return groups;
}