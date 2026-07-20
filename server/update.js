try {
  await db.execute({ 
    sql: `UPDATE clan_wars SET phase='defense' WHERE phase='scout'`, 
    args: [] 
  });
} catch {}
