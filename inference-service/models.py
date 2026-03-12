import asyncio
import importlib.util
from pathlib import Path


class InferenceModels:
    def __init__(self) -> None:
        self._initialized = False
        self.voice_analyzer = None
        self.video_inference_analyzer = None
        self.facial_expression_analyzer = None

    async def initialize(self) -> None:
        if self._initialized:
            return

        module = self._load_vision_server_module()
        self.voice_analyzer = module.voice_analyzer
        self.video_inference_analyzer = module.video_inference_analyzer
        self.facial_expression_analyzer = module.facial_expression_analyzer

        loop = asyncio.get_running_loop()
        await asyncio.gather(
            loop.run_in_executor(None, self.voice_analyzer.load),
            loop.run_in_executor(None, self.video_inference_analyzer.load),
            loop.run_in_executor(None, self.facial_expression_analyzer.load),
        )

        self._initialized = True

    async def analyze_chunk(self, *, video_path: str, chunk_id: str) -> dict:
        if not self._initialized:
            await self.initialize()

        loop = asyncio.get_running_loop()
        voice_task = loop.run_in_executor(None, self.voice_analyzer.analyze, video_path, chunk_id)
        confidence_task = loop.run_in_executor(
            None,
            self.video_inference_analyzer.analyze,
            video_path,
            chunk_id,
        )
        facial_task = loop.run_in_executor(
            None,
            self.facial_expression_analyzer.analyze,
            video_path,
            chunk_id,
        )

        voice_result, confidence_result, facial_result = await asyncio.gather(
            voice_task,
            confidence_task,
            facial_task,
        )

        return {
            "voice_analysis": voice_result,
            "video_analysis": confidence_result,
            "facial_analysis": facial_result,
        }

    @staticmethod
    def _load_vision_server_module():
        repo_root = Path(__file__).resolve().parent.parent
        module_path = repo_root / "Vision" / "vision_server.py"
        if not module_path.exists():
            raise FileNotFoundError(f"Could not locate vision_server.py at {module_path}")

        module_name = "vision_server_shared"
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("Unable to load vision_server.py module spec")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module