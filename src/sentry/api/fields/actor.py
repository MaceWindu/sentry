from collections import defaultdict, namedtuple
from rest_framework import serializers
from sentry.models import actor_type_to_model, Team, User
from sentry.utils.auth import find_users
from sentry.utils.compat import filter


class Actor(namedtuple("Actor", "id type")):
    def get_actor_id(self):
        return "%s:%d" % (self.type.__name__.lower(), self.id)

    def get_type_string(self):
        return self.type.__name__.lower()

    @classmethod
    def from_model(cls, actor):
        return actor_type_to_model(actor.type).objects.get(actor_id=actor.id)

    @classmethod
    def from_actor_identifier(cls, actor_identifier):
        """
        Returns an Actor tuple corresponding to a User or Team associated with
        the given identifier.

        Forms `actor_identifier` can take:
            1231 -> look up User by id
            "1231" -> look up User by id
            "user:1231" -> look up User by id
            "team:1231" -> look up Team by id
            "maiseythedog" -> look up User by username
            "maisey@dogsrule.com" -> look up User by primary email
        """
        # If we have an integer, fall back to assuming it's a User
        if isinstance(actor_identifier, int):
            return Actor(actor_identifier, User)

        # If the actor_identifier is a simple integer as a string,
        # we're also a User
        if actor_identifier.isdigit():
            return Actor(int(actor_identifier), User)

        if actor_identifier.startswith("user:"):
            return cls(int(actor_identifier[5:]), User)

        if actor_identifier.startswith("team:"):
            return cls(int(actor_identifier[5:]), Team)

        try:
            return Actor(find_users(actor_identifier)[0].id, User)
        except IndexError:
            raise serializers.ValidationError("Unable to resolve actor identifier")

    def resolve(self):
        return self.type.objects.get(id=self.id)

    def resolve_to_actor(self):
        return self.resolve().actor

    @classmethod
    def resolve_many(cls, actors):
        """
        Resolve multiple actors at the same time. Returns the result in the same order
        as the input, minus any actors we couldn't resolve.
        :param actors:
        :return:
        """
        if not actors:
            return []

        actors_by_type = defaultdict(list)
        for actor in actors:
            actors_by_type[actor.type].append(actor)

        results = {}
        for type, _actors in actors_by_type.items():
            for instance in type.objects.filter(id__in=[a.id for a in _actors]):
                results[(type, instance.id)] = instance

        return list(filter(None, [results.get((actor.type, actor.id)) for actor in actors]))

    @classmethod
    def resolve_dict(cls, actor_dict):
        actors_by_type = defaultdict(list)
        for actor in actor_dict.values():
            actors_by_type[actor.type].append(actor)

        resolved_actors = {}
        for type, actors in actors_by_type.items():
            resolved_actors[type] = {
                actor.id: actor for actor in type.objects.filter(id__in=[a.id for a in actors])
            }

        return {key: resolved_actors[value.type][value.id] for key, value in actor_dict.items()}


class ActorField(serializers.Field):
    def to_representation(self, value):
        return value.get_actor_id()

    def to_internal_value(self, data):
        if not data:
            return None

        try:
            return Actor.from_actor_identifier(data)
        except Exception:
            raise serializers.ValidationError("Unknown actor input")
