import logging
from typing import Any

from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)


def build_tool_vector_index_from_registry(registry) -> Any:
    """
    Build a FAISS vector index of tools from the registry.
    Each tool is converted into a Document with metadata for search.
    """
    tools = registry.list_tools()
    if not tools:
        raise ValueError("No tools registered in the registry.")

    docs = []
    for name, meta in tools.items():
        try:
            # Nội dung mô tả đầy đủ tool
            txt = (
                f"Tool: {meta.name}\n"
                f"Description: {meta.description}\n"
                f"Params: {meta.parameters_schema}"
            )

            docs.append(
                Document(
                    page_content=txt,
                    metadata={
                        "tool_name": meta.name,
                        "description": meta.description,
                        "schema": meta.parameters_schema,
                    },
                )
            )
        except Exception as e:
            logger.error(f"Failed to build doc for tool {name}: {e}")

    if not docs:
        raise ValueError("No documents created for tool vector index.")

    # Dùng HuggingFace sentence-transformers để tạo embedding
    embedding = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    db = FAISS.from_documents(docs, embedding)

    return db
