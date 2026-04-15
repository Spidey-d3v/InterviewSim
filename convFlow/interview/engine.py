import asyncio

from interview.init_state import create_initial_state

# Phase Nodes
from interview.nodes.node_p1_intro import node_p1_introduction
from interview.nodes.node_p2_resume import node_p2_resume_based
from interview.nodes.node_p3_core_tech import node_p3_core_tech
from interview.nodes.node_p4_situational import node_p4_situational
from interview.nodes.node_p5_closing import node_p5_closing
from interview.utils.transcript_utils import save_phase_transcript
from interview.nodes.node_s_evaluator import node_s_evaluator
# Controller
from interview.nodes.node_q_controller import node_q_controller
from interview.nodes.node_r_streamer import node_r_generate_stream
# Phase config
from interview.config.phase_config import PHASE_CONFIG
from interview.utils.rolling_summarizer import update_summary

class InterviewEngine:

    def __init__(self, llm, job_role: str = "", job_description: str = "", resume_context: str = "",
    list_of_technical_topics: str = "", company_name: str = "", candidate_name: str = "", interviewer_name: str = ""):
        self.llm = llm
        self.state = create_initial_state()
        self.interview_end = False

        if job_role:
            self.state["job_role"] = job_role

        if job_description:
            self.state["job_description"] = job_description

        if resume_context:
            self.state["resume_context"] = resume_context

        if list_of_technical_topics:
            self.state["list_of_technical_topics"] = list_of_technical_topics
        
        if company_name:
            self.state["company_name"] = company_name

        if candidate_name:
            self.state["candidate_name"] = candidate_name

        if interviewer_name:
            self.state["interviewer_name"] = interviewer_name
    
    async def _run_evaluator(self, phase, transcript):
        result = await node_s_evaluator(self.llm, phase, transcript)

        self.state["candidate_profile"]["scores"][phase] = result

    async def stream_step(self, transcript: str):

        # -------------------- INITIAL TURN --------------------
        if self.state["phase"] == "intro" and not self.state.get("last_question"):
            p_output = await node_p1_introduction(
                self.llm,
                self.state["interviewer_name"],
                self.state["job_role"],
                self.state["company_name"],
                self.state["job_description"],
                self.state["candidate_name"],
                self.state.get("resume_context", ""),
                ""
            )

            final_response = (p_output or "").strip()
            if final_response:
                yield final_response

            self.state["last_question"] = final_response
            return

        # -------------------- UPDATE STATE --------------------
        last_q = self.state.get("last_question", "")
        last_a = transcript

        self.state["last_answer"] = last_a

        # Append to phase transcript
        self.state["phase_transcript"] = self.state.get("phase_transcript", "")
        self.state["phase_transcript"] += f"\nInterviewer: {last_q}\nCandidate: {last_a}\n"

        # Update counters
        self.state["phase_question_count"] = self.state.get("phase_question_count", 0) + 1

        # -------------------- SELECT PHASE NODE --------------------
        current_phase = self.state["phase"]

        if current_phase == "intro":
            node_p_task = asyncio.create_task(
                node_p1_introduction(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["company_name"],
                    self.state["job_description"],
                    self.state["candidate_name"],
                    self.state.get("resume_context", ""),
                    self.state["phase_transcript"]
                )
            )

        elif current_phase == "resume":
            node_p_task = asyncio.create_task(
                node_p2_resume_based(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["company_name"],
                    self.state["job_description"],
                    self.state.get("resume_context", ""),
                    self.state["candidate_name"],
                    self.state.get("summary_till_now", ""),
                    self.state["phase_transcript"]
                )
            )

        elif current_phase == "core_tech":
            node_p_task = asyncio.create_task(
                node_p3_core_tech(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["company_name"],
                    self.state["job_description"],
                    self.state.get("resume_context", ""),
                    self.state.get("summary_till_now", ""),
                    self.state["candidate_name"],
                    self.state.get("list_of_technical_topics", ""),
                    self.state["phase_transcript"]
                )
            )

        elif current_phase == "situational":
            node_p_task = asyncio.create_task(
                node_p4_situational(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["company_name"],
                    self.state["job_description"],
                    self.state.get("resume_context", ""),
                    self.state["candidate_name"],
                    self.state.get("summary_till_now", ""),
                    self.state["phase_transcript"]
                )
            )

        elif current_phase == "closing":
            node_p_task = asyncio.create_task(
                node_p5_closing(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["company_name"],
                    self.state["job_description"],
                    self.state.get("summary_till_now", ""),
                    self.state["candidate_name"],
                    self.state["phase_transcript"]
                )
            )

        else:
            # fallback
            node_p_task = asyncio.create_task(
                node_p5_closing(
                    self.llm,
                    self.state["interviewer_name"],
                    self.state["job_role"],
                    self.state["job_description"],
                    self.state.get("summary_till_now", ""),
                    self.state["phase_transcript"]
                )
            )

        # -------------------- NODE Q (CONTROLLER) --------------------
        node_q_task = asyncio.create_task(
            node_q_controller(
                self.llm,
                self.state,
                last_a,
                PHASE_CONFIG
            )
        )

        # -------------------- PARALLEL EXECUTION --------------------
        p_output, q_output = await asyncio.gather(node_p_task, node_q_task)

        # Update flag if controller signals termination (e.g., abusive behavior)
        if q_output.get("should_terminate"):
            self.interview_end = True

        # -------------------- DECISION ------------------
        if q_output.get("intervention_needed"):
            if q_output.get("intervention_type") == "phase_transition":
                old_phase = self.state["phase"]
                transcript = self.state.get("phase_transcript", "")

                # -------------------- SAVE TRANSCRIPT --------------------
                save_phase_transcript(old_phase, transcript)

                # Check if moving past the final phase
                if old_phase == "closing":
                    self.interview_end = True

                # -------------------- ASYNC EVALUATION --------------------
                asyncio.create_task(
                    self._run_evaluator(old_phase, transcript)
                )

                # -------------------- UPDATE SUMMARY --------------------
                self.state["summary_till_now"] = await update_summary(
                    self.llm,
                    self.state.get("summary_till_now", ""),
                    transcript
                )

                # -------------------- PHASE SWITCH --------------------
                self.state["phase"] = q_output.get("next_phase", self.state["phase"]) # phase change
                self.state["phase_question_count"] = 0
                self.state["phase_word_count"] = 0
                self.state["phase_transcript"] = ""

            # Use controller context over standard phase node context
            selected_context = q_output.get("context_for_generator", p_output)
        else:
            selected_context = p_output

        # -------------------- NODE R (GENERATOR) --------------------
        final_response = ""

        async for token in node_r_generate_stream(
            self.llm,
            self.state,
            selected_context
        ):
            final_response += token
            yield token

        # -------------------- UPDATE LAST QUESTION --------------------
        self.state["last_question"] = final_response