# finance_agent/utils.py
import logging
import logging.config
import os
logger = logging.getLogger(__name__)

from .models import AnsweredSubQuestion, SubQuestion

def get_verbosity() -> bool:
    return os.environ.get("VERBOSE", "False") == "True"


def configure_logging(verbose: bool):
    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s - %(levelname)s - %(name)s - %(message)s",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",  # Default is stderr
                "formatter": "standard",
            },
        },
        "loggers": {
            "finance_agent.agent": {
                "handlers": ["console"],
                "level": "INFO" if verbose else "CRITICAL",
                "propagate": False,
            },
            "finance_agent.utils": {
                "handlers": ["console"],
                "level": "INFO" if verbose else "CRITICAL",
                "propagate": False,
            },
            "finance_agent.tools": {
                "handlers": ["console"],
                "level": "INFO" if verbose else "CRITICAL",
                "propagate": False,
            },
            "finance_agent.chains_genai": {
                "handlers": ["console"],
                "level": "INFO" if verbose else "CRITICAL",
                "propagate": False,
            },
        },
        "root": {
            "handlers": ["console"],
            "level": "WARNING" if verbose else "CRITICAL",
        },
    }
    logging.config.dictConfig(logging_config)


def get_dependencies(
    answered_subquestions: list[AnsweredSubQuestion], subquestion: SubQuestion
) -> list[AnsweredSubQuestion]:
    dependency_subquestions = [
        answered_subq
        for answered_subq in answered_subquestions
        if answered_subq.subquestion.id in (subquestion.depends_on or [])
    ]
    logger.debug(
        f"get_dependencies: Found {len(dependency_subquestions)} dependencies for subquestion ID {subquestion.id}."
    )
    return dependency_subquestions
