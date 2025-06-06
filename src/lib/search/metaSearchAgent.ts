import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from '@langchain/core/prompts';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
} from '@langchain/core/runnables';
import { BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import LineListOutputParser from '../outputParsers/listLineOutputParser';
import LineOutputParser from '../outputParsers/lineOutputParser';
import { getDocumentsFromLinks } from '../utils/documents';
import { Document } from 'langchain/document';
import { searchSearxng } from '../searxng';
import path from 'node:path';
import fs from 'node:fs';
import computeSimilarity from '../utils/computeSimilarity';
import formatChatHistoryAsString from '../utils/formatHistory';
import eventEmitter from 'events';
import { StreamEvent } from '@langchain/core/tracers/log_stream';

export interface MetaSearchAgentType {
  searchAndAnswer: (
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
  ) => Promise<eventEmitter>;
}

interface Config {
  searchWeb: boolean;
  rerank: boolean;
  summarizer: boolean;
  rerankThreshold: number;
  queryGeneratorPrompt: string;
  responsePrompt: string;
  activeEngines: string[];
  useFinance: boolean;
}

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

class MetaSearchAgent implements MetaSearchAgentType {
  private config: Config;
  private strParser = new StringOutputParser();

  constructor(config: Config) {
    this.config = config;
  }

  private async createSearchRetrieverChain(llm: BaseChatModel) {
    (llm as unknown as ChatOpenAI).temperature = 0;

    console.debug('Creating search retriever chain...');

    return RunnableSequence.from([
      PromptTemplate.fromTemplate(this.config.queryGeneratorPrompt),
      llm,
      this.strParser,
      RunnableLambda.from(async (input: string) => {
        // Input is user's question inn <question>...</question> tags (result is from retriever prompt run)
        console.debug('Given Input:', input);

        // Parsers for XML tags
        const linksOutputParser = new LineListOutputParser({
          key: 'links',
        });

        const questionOutputParser = new LineOutputParser({
          key: 'question',
        });

        const finQueriesOutputParser = new LineOutputParser({
          key: 'queries',
        });

        const finSingleQueryOutputParser = new LineOutputParser({
          key: 'query',
        });

        const finTickerOutputParser = new LineOutputParser({
          key: 'ticker',
        });

        const finCommandOutputParser = new LineOutputParser({
          key: 'command',
        });

        // Parse any links from the user input
        const links = await linksOutputParser.parse(input);

        console.debug('Parsed Links:', links);
        
        // Parse the question from the user input (removing question tags)
        // TODO what does this really do??? I think this solely extracts the question from the input since there could be other tags?
        // Actually this seems to be the result of the retreiever prompt?
        let question = this.config.summarizer
          ? await questionOutputParser.parse(input)
          : input;

        console.debug('Parsed Question:', question);

        let docs: Document[] = [];

        // If we're in Finance mode, we want to prefer financial data over web search
        if (this.config.useFinance) {
          let queriesRaw = await finQueriesOutputParser.parse(input);
          console.debug('Parsed Queries:', queriesRaw);
          
          const queryBlocks = queriesRaw.split('\n').map(q => q.trim()).filter(Boolean);

          for (const queryBlock of queryBlocks) {
            const query = await finSingleQueryOutputParser.parse(queryBlock);
            const ticker = await finTickerOutputParser.parse(query);
            const command = await finCommandOutputParser.parse(query);

            console.debug('Parsed Ticker:', ticker);
            console.debug('Parsed Command:', command);

            // Make backend call and get data
            console.log("Finance Backend Endpoint:", `${process.env.FIN_BACKEND_SERVER}/${command}?ticker=${ticker}`);
            const response = await fetch(`${process.env.FIN_BACKEND_SERVER}/${command}?ticker=${ticker}`, {
              method: 'GET',
            });

            if (!response.ok) {
              console.warn(`Finance data fetch failed for ${ticker} ${command}`);
              continue;
            }
          
            const result = await response.json();

            console.debug('Parsed Result:', result);

            // store results in docs??? needs to be passed to answering chain
            docs.push(
              new Document({
                pageContent: result.content || JSON.stringify(result),
                metadata: {
                  ticker,
                  command,
                  url: `https://finviz.com/quote.ashx?t=${ticker}`, 
                },
              }),
            );
          }
        }
        // TODO need to handle cases where financial data neneeded and question both needed and not neneded

        if (question === 'not_needed') {
          // This will question will not perform a SearXNG search
          return { query: '', docs: docs };
        }
        
        // Perform the XNG search

        // If the user provided a link in the input, 
        if (links.length > 0) {
          console.debug("CP1.1 - web search summarizer");
          // If the user provided a link in the input
          if (question.length === 0) {
            console.debug("CP1.2 - no question");
            // If the user didn't provide a question and just the link, we will summarize the content
            question = 'summarize';
          }


          const linkDocs = await getDocumentsFromLinks({ links });

          const docGroups: Document[] = [];

          linkDocs.map((doc) => {
            const URLDocExists = docGroups.find(
              (d) =>
                d.metadata.url === doc.metadata.url &&
                d.metadata.totalDocs < 10,
            );

            if (!URLDocExists) {
              docGroups.push({
                ...doc,
                metadata: {
                  ...doc.metadata,
                  totalDocs: 1,
                },
              });
            }

            const docIndex = docGroups.findIndex(
              (d) =>
                d.metadata.url === doc.metadata.url &&
                d.metadata.totalDocs < 10,
            );

            if (docIndex !== -1) {
              docGroups[docIndex].pageContent =
                docGroups[docIndex].pageContent + `\n\n` + doc.pageContent;
              docGroups[docIndex].metadata.totalDocs += 1;
            }
          });

          await Promise.all(
            docGroups.map(async (doc) => {
              const res = await llm.invoke(`
            You are a web search summarizer, tasked with summarizing a piece of text retrieved from a web search. Your job is to summarize the 
            text into a detailed, 2-4 paragraph explanation that captures the main ideas and provides a comprehensive answer to the query.
            If the query is \"summarize\", you should provide a detailed summary of the text. If the query is a specific question, you should answer it in the summary.
            
            - **Journalistic tone**: The summary should sound professional and journalistic, not too casual or vague.
            - **Thorough and detailed**: Ensure that every key point from the text is captured and that the summary directly answers the query.
            - **Not too lengthy, but detailed**: The summary should be informative but not excessively long. Focus on providing detailed information in a concise format.

            The text will be shared inside the \`text\` XML tag, and the query inside the \`query\` XML tag.

            <example>
            1. \`<text>
            Docker is a set of platform-as-a-service products that use OS-level virtualization to deliver software in packages called containers. 
            It was first released in 2013 and is developed by Docker, Inc. Docker is designed to make it easier to create, deploy, and run applications 
            by using containers.
            </text>

            <query>
            What is Docker and how does it work?
            </query>

            Response:
            Docker is a revolutionary platform-as-a-service product developed by Docker, Inc., that uses container technology to make application 
            deployment more efficient. It allows developers to package their software with all necessary dependencies, making it easier to run in 
            any environment. Released in 2013, Docker has transformed the way applications are built, deployed, and managed.
            \`
            2. \`<text>
            The theory of relativity, or simply relativity, encompasses two interrelated theories of Albert Einstein: special relativity and general
            relativity. However, the word "relativity" is sometimes used in reference to Galilean invariance. The term "theory of relativity" was based
            on the expression "relative theory" used by Max Planck in 1906. The theory of relativity usually encompasses two interrelated theories by
            Albert Einstein: special relativity and general relativity. Special relativity applies to all physical phenomena in the absence of gravity.
            General relativity explains the law of gravitation and its relation to other forces of nature. It applies to the cosmological and astrophysical
            realm, including astronomy.
            </text>

            <query>
            summarize
            </query>

            Response:
            The theory of relativity, developed by Albert Einstein, encompasses two main theories: special relativity and general relativity. Special
            relativity applies to all physical phenomena in the absence of gravity, while general relativity explains the law of gravitation and its
            relation to other forces of nature. The theory of relativity is based on the concept of "relative theory," as introduced by Max Planck in
            1906. It is a fundamental theory in physics that has revolutionized our understanding of the universe.
            \`
            </example>

            Everything below is the actual data you will be working with. Good luck!

            <query>
            ${question}
            </query>

            <text>
            ${doc.pageContent}
            </text>

            Make sure to answer the query in the summary.
          `);

              const document = new Document({
                pageContent: res.content as string,
                metadata: {
                  title: doc.metadata.title,
                  url: doc.metadata.url,
                },
              });

              docs.push(document);
            }),
          );

          return { query: question, docs: docs };
        } else {

          console.debug("CP2");

          // This removes the <think> tags from the question
          // Where do the thinnk Tags come from? questionOutputParser?
          // Note the think tags are not always present...
          question = question.replace(/<think>.*?<\/think>/g, '');
          console.debug("New Question: " + question);

          const res = await searchSearxng(question, {
            language: 'en',
            engines: this.config.activeEngines,
          });

          
          const documents = res.results.map(
            (result) =>
              new Document({ 
                pageContent:
                  result.content ||
                  (this.config.activeEngines.includes('youtube')
                    ? result.title
                    : '') /* Todo: Implement transcript grabbing using Youtubei (source: https://www.npmjs.com/package/youtubei) */,
                metadata: {
                  title: result.title,
                  url: result.url,
                  ...(result.img_src && { img_src: result.img_src }),
                },
              }),
          );

          return { query: question, docs: [...docs, ...documents] };
        }
      }),
    ]);
  }
private async createAnsweringChain(
  llm: BaseChatModel,
  fileIds: string[],
  embeddings: Embeddings,
  optimizationMode: 'speed' | 'balanced' | 'quality',
) {
  const chatPrompt = ChatPromptTemplate.fromMessages([
    ['system', this.config.responsePrompt],
    new MessagesPlaceholder('chat_history'),
    ['user', '{query}'],
  ]);

  return RunnableSequence.from([
    RunnableMap.from({
      query: (input: BasicChainInput) => input.query,
      chat_history: (input: BasicChainInput) => input.chat_history,
      date: () => new Date().toISOString(),
      context: RunnableLambda.from(async (input: BasicChainInput) => {
        const processedHistory = formatChatHistoryAsString(input.chat_history);

        let query = input.query;
        let docs: Document[] = [];

        if (this.config.searchWeb) {
          const searchRetrieverChain = await this.createSearchRetrieverChain(llm);
          const searchRetrieverResult = await searchRetrieverChain.invoke({
            chat_history: processedHistory,
            query,
          });

          query = searchRetrieverResult.query;
          docs = searchRetrieverResult.docs;
          console.log("Search Retriever Query:", query);
          console.log("Search Retriever Docs:", docs);
        }

        const sortedDocs = await this.rerankDocs(
          query,
          docs ?? [],
          fileIds,
          embeddings,
          optimizationMode,
        );

        return sortedDocs;
      })
        .withConfig({ runName: 'FinalSourceRetriever' })
        .pipe(this.processDocs),
    }),

    // Inject prompt logging here
    RunnableLambda.from(async (input) => {
      const rendered = await chatPrompt.formatMessages(input);
      console.log('📝 Final Prompt Sent to LLM:');
      for (const msg of rendered) {
        console.log(`${msg._getType().toUpperCase()}: ${msg.content}`);
      }
      return rendered;
    }),

    llm,
    this.strParser,
  ]).withConfig({ runName: 'FinalResponseGenerator' });
}


  private async rerankDocs(
    query: string,
    docs: Document[],
    fileIds: string[],
    embeddings: Embeddings,
    optimizationMode: 'speed' | 'balanced' | 'quality',
  ) {
    if (docs.length === 0 && fileIds.length === 0) {
      return docs;
    }

    const filesData = fileIds
      .map((file) => {
        const filePath = path.join(process.cwd(), 'uploads', file);

        const contentPath = filePath + '-extracted.json';
        const embeddingsPath = filePath + '-embeddings.json';

        const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
        const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));

        const fileSimilaritySearchObject = content.contents.map(
          (c: string, i: number) => {
            return {
              fileName: content.title,
              content: c,
              embeddings: embeddings.embeddings[i],
            };
          },
        );

        return fileSimilaritySearchObject;
      })
      .flat();

    if (query.toLocaleLowerCase() === 'summarize') {
      return docs.slice(0, 15);
    }

    const docsWithContent = docs.filter(
      (doc) => doc.pageContent && doc.pageContent.length > 0,
    );

    if (optimizationMode === 'speed' || this.config.rerank === false) {
      if (filesData.length > 0) {
        const [queryEmbedding] = await Promise.all([
          embeddings.embedQuery(query),
        ]);

        const fileDocs = filesData.map((fileData) => {
          return new Document({
            pageContent: fileData.content,
            metadata: {
              title: fileData.fileName,
              url: `File`,
            },
          });
        });

        const similarity = filesData.map((fileData, i) => {
          const sim = computeSimilarity(queryEmbedding, fileData.embeddings);

          return {
            index: i,
            similarity: sim,
          };
        });

        let sortedDocs = similarity
          .filter(
            (sim) => sim.similarity > (this.config.rerankThreshold ?? 0.3),
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 15)
          .map((sim) => fileDocs[sim.index]);

        sortedDocs =
          docsWithContent.length > 0 ? sortedDocs.slice(0, 8) : sortedDocs;

        return [
          ...sortedDocs,
          ...docsWithContent.slice(0, 15 - sortedDocs.length),
        ];
      } else {
        return docsWithContent.slice(0, 15);
      }
    } else if (optimizationMode === 'balanced') {
      const [docEmbeddings, queryEmbedding] = await Promise.all([
        embeddings.embedDocuments(
          docsWithContent.map((doc) => doc.pageContent),
        ),
        embeddings.embedQuery(query),
      ]);

      docsWithContent.push(
        ...filesData.map((fileData) => {
          return new Document({
            pageContent: fileData.content,
            metadata: {
              title: fileData.fileName,
              url: `File`,
            },
          });
        }),
      );

      docEmbeddings.push(...filesData.map((fileData) => fileData.embeddings));

      const similarity = docEmbeddings.map((docEmbedding, i) => {
        const sim = computeSimilarity(queryEmbedding, docEmbedding);

        return {
          index: i,
          similarity: sim,
        };
      });

      const sortedDocs = similarity
        .filter((sim) => sim.similarity > (this.config.rerankThreshold ?? 0.3))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 15)
        .map((sim) => docsWithContent[sim.index]);

      return sortedDocs;
    }

    return [];
  }

  private processDocs(docs: Document[]) {
    return docs
      .map(
        (_, index) =>
          `${index + 1}. ${docs[index].metadata.title} ${docs[index].pageContent}`,
      )
      .join('\n');
  }

  private async handleStream(
    stream: AsyncGenerator<StreamEvent, any, any>,
    emitter: eventEmitter,
  ) {
    for await (const event of stream) {
      if (
        event.event === 'on_chain_end' &&
        event.name === 'FinalSourceRetriever'
      ) {
        ``;
        emitter.emit(
          'data',
          JSON.stringify({ type: 'sources', data: event.data.output }),
        );
      }
      if (
        event.event === 'on_chain_stream' &&
        event.name === 'FinalResponseGenerator'
      ) {
        emitter.emit(
          'data',
          JSON.stringify({ type: 'response', data: event.data.chunk }),
        );
      }
      if (
        event.event === 'on_chain_end' &&
        event.name === 'FinalResponseGenerator'
      ) {
        emitter.emit('end');
      }
    }
  }

  async searchAndAnswer(
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
  ) {
    const emitter = new eventEmitter();

    const answeringChain = await this.createAnsweringChain(
      llm,
      fileIds,
      embeddings,
      optimizationMode,
    );

    const stream = answeringChain.streamEvents(
      {
        chat_history: history,
        query: message,
      },
      {
        version: 'v1',
      },
    );

    this.handleStream(stream, emitter);

    return emitter;
  }
}

export default MetaSearchAgent;
