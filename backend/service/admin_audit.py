from entity.models import AdminAction


def record_admin_action(db, actor, action, target_id, target_label):
  db.add(AdminAction(actor_name=actor.nickname, action=action, target_id=str(target_id), target_label=target_label))
