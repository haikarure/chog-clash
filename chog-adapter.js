/* Keep the public game interface in CHOG IDs without changing the combat kits. */
(() => {
  const game=window.__game,chog=window.CHOG;
  const start=game.startMatch,select=game.selectCharacter,snapshot=game.snapshot,announce=game.announceSelection;
  game.startMatch=(options={})=>start({...options,player:chog.kit(options.player||'yot'),enemy:chog.kit(options.enemy||'mamio')});
  game.selectCharacter=id=>select(chog.kit(id));
  game.snapshot=()=>{
    const s=snapshot();return {...s,sourceKits:{player:s.selectedCharacter,enemy:s.opponentCharacter},
      selectedCharacter:chog.id(s.selectedCharacter),opponentCharacter:chog.id(s.opponentCharacter),
      playable:s.playable.map(chog.id)};
  };
  game.announceSelection=id=>announce(chog.kit(id));
})();
