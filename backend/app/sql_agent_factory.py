from .analytics_agent import AnalyticsSqlAgent
from .config import Settings
from .template_sql_agent import TemplateSqlAgent


def build_sql_agent(provider: str, settings: Settings) -> AnalyticsSqlAgent:
    if provider == "template":
        return TemplateSqlAgent(settings)
    raise ValueError(f"Unsupported SQL agent provider: {provider}")
