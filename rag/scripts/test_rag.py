"""
Script de test manuel : pose une vraie question au RAG et affiche la réponse.

Usage :
    python scripts/test_rag.py                       → mode interactif (pose une question au prompt)
    python scripts/test_rag.py "Quel est le prix..."  → mode direct (une seule question, comme avant)
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.rag import ask


def poser_question(question: str) -> None:
    print(f"\n❓ Question : {question}\n")
    print("🔎 Recherche en cours...\n")

    resultat = ask(question)

    print("💬 Réponse :")
    print(resultat["reponse"])

    print("\n📚 Sources utilisées :")
    if not resultat["sources"]:
        print("  (aucune)")
    for s in resultat["sources"]:
        marqueur = " ⚠️ (confiance faible)" if s.get("confiance_faible") else ""
        print(f"  - {s['nom']} ({s['service_type']}) — similarité : {s['similarity']}{marqueur}")


def main():
    # Mode direct : une question passée en argument (comportement d'origine, inchangé)
    if len(sys.argv) > 1:
        question = " ".join(sys.argv[1:])
        poser_question(question)
        return

    # Mode interactif : boucle de questions jusqu'à "quit"/"exit"/Ctrl+C
    print("💬 Mode interactif — tape ta question et appuie sur Entrée.")
    print("   (tape 'quit', 'exit' ou Ctrl+C pour arrêter)\n")

    while True:
        try:
            question = input("❓ > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Fin.")
            break

        if not question:
            continue
        if question.lower() in {"quit", "exit", "q"}:
            print("👋 Fin.")
            break

        poser_question(question)
        print("\n" + "-" * 60 + "\n")


if __name__ == "__main__":
    main()