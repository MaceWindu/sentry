# Generated by Django 1.11.28 on 2020-04-01 01:34

from django.db import migrations


class Migration(migrations.Migration):
    # This flag is used to mark that a migration shouldn't be automatically run in
    # production. We set this to True for operations that we think are risky and want
    # someone from ops to run manually and monitor.
    # General advice is that if in doubt, mark your migration as `is_dangerous`.
    # Some things you should always mark as dangerous:
    # - Large data migrations. Typically we want these to be run manually by ops so that
    #   they can be monitored. Since data migrations will now hold a transaction open
    #   this is even more important.
    # - Adding columns to highly active tables, even ones that are NULL.
    is_dangerous = True

    # This flag is used to decide whether to run this migration in a transaction or not.
    # By default we prefer to run in a transaction, but for migrations where you want
    # to `CREATE INDEX CONCURRENTLY` this needs to be set to False. Typically you'll
    # want to create an index concurrently when adding one to an existing table.
    atomic = False

    dependencies = [
        ("sentry", "0059_add_new_sentry_app_features"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    """
                    CREATE INDEX CONCURRENTLY "sentry_eventattachment_project_id_date_added_fi_f3b0597f_idx" ON "sentry_eventattachment" ("project_id", "date_added", "file_id");
                    """,
                    reverse_sql="""
                        DROP INDEX CONCURRENTLY "sentry_eventattachment_project_id_date_added_fi_f3b0597f_idx";
                        """,
                )
            ],
            state_operations=[
                migrations.AlterIndexTogether(
                    name="eventattachment",
                    index_together=set(
                        [("project_id", "date_added", "file"), ("project_id", "date_added")]
                    ),
                ),
            ],
        )
    ]
