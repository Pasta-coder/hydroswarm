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
            json={"query": f"Infrastructure drainage capacity and protocol for {state['location']}", "k": 2}
        )
        docs = response.json()

        if docs and len(docs) > 0:
            rag_context = "\n---\n".join([doc.get("text", "")[:500] for doc in docs])
        else:
            rag_context = "No infrastructure data available for this sector."
    except Exception as e:
        # THE FIX: Provide a structured fallback to prevent wild hallucinations
        rag_context = """
        WARNING: Live database is unavailable. Using emergency defaults:
        - Assume standard drainage capacity of 30mm/hr.
        - Assume moderate infrastructure resilience.
        - Flag this report as UNVERIFIED.
        """
        rag_context = "Fallback mode engaged." + rag_context

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