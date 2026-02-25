import requests
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .state import SwarmState

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

def infrastructure_agent(state: SwarmState):
    print(f"🏗️  [Infrastructure] Querying Pathway Live Memory for {state['location']}...")

    try:
        response = requests.post(
            "http://127.0.0.1:8000/v1/retrieve",
            json={"query": f"Infrastructure drainage capacity and protocol for {state['location']}", "k": 1}
        )
        docs = response.json()

        if docs and len(docs) > 0:
            rag_context = docs[0].get("text", "No specific data found.")
        else:
            rag_context = "No infrastructure data available for this sector."
    except Exception as e:
        rag_context = "Database offline. Fallback mode engaged."

    print(f"   -> Found Context: {rag_context[:100]}...")

    prompt = f"""
    You are the Infrastructure AI specialist.
    Weather Alert received: {state['sentinel_alert']}
    Live Database Context for {state['location']}: {rag_context}

    Task: Cross-reference the weather alert against the live database context. Evaluate if the current infrastructure can handle this event.
    Write a concise, 2-sentence infrastructure impact report based ONLY on the Live Database Context provided.
    """
    response = llm.invoke(prompt)
    return {"infrastructure_report": response.content}