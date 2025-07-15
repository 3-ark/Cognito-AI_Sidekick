Find the latest release and full changelog here [Cognito - AI Sidekick](https://github.com/3-ark/Cognito-AI_Sidekick/releases).

## [3.8.9] - 2024-07-13

* optimize BM25, Embedding chunk preprocess

```
How_to_use_RAG:

1. Go to RAG Settings panel in Configuration.
2. Set your favorite embedding models (better start it before embedding if you are using local model).
3. Start embedding manually by clicking on rebuild button in settings sheet for the first time.
4. BM25 indexing will happen automatically.
5. Update embedding is needed when you are in manual mode. Auto model needs you keep your local embedding model mounted with your LLM if you are running  a local llm. So it affects the generation speed. For API it will cost more because you won't want everything to be embedded normally. 
6. You are all set now. In the input bar, type '/r [your query]', then your LLM will return response with retrieved context.
7. Test or quick search from the search bar in settings sheet by clicking the avatar. 

*Note: 1. You have to use the same embedding model for your embedding and query.*
      *2. Current BM25 have a very good support for Latin languages, Cyrillic, Korean, Arabic, and Devanagari are fairly supported, Japanese should have a similar performance with Latin languages. For embedding, you have to use your favorite embedding models, this is the most important for the performance.*
```