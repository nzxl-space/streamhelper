var script = $("script[src*=script]");

$(window).on("load", () => {
    $("body").hide().fadeIn("slow");
    Swal.fire({
        imageUrl: "/assets/logo.svg",
        imageWidth: 140,
        imageHeight: 50,
        title: "Welcome!",
        text: "We'll walk you through this step-by-step, so you can get started quickly. This will only take a few seconds.",
        allowOutsideClick: false,
        showClass: {
            popup: "animated fadeInUp fast"
        },
        hideClass: {
            popup: "animated fadeOutDown faster",
        }
    }).then(() => {
        Swal.fire({
            title: "Link your Discord",
            text: "We need some of your info.. This is only used to gather osu! related data and your Twitch username.",
            footer: "<img class='gif' src='/assets/activities.gif'/><a class='showGif'>Why is this needed?</a>",
            confirmButtonText: "Authorize",
            allowOutsideClick: false,
            showClass: {
                popup: "animated fadeInDown fast"
            },
            hideClass: {
                popup: "animated fadeOutUp faster",
            }
        }).then(() => {
            var discordPopup = window.open(script.attr("data-discord"), "popUpWindow", "height=750,width=500");
            
            Swal.fire({
                title: "Waiting for authorization..",
                showConfirmButton: false,
                allowOutsideClick: false,
                didOpen: () => {
                    var checkPopup = setInterval(() => {
                        if(discordPopup.closed) {
                            clearInterval(checkPopup);
                            Swal.fire({
                                icon: "success",
                                title: "Discord Linked",
                                html: "Beatmap requests are now enabled.<br>If the bot doesn\'t listen to requests, try re-authorizing again.<br>Also did you know that there's a !np command? 😎",
                                allowOutsideClick: false,
                                showConfirmButton: false
                            });
                        }
                    }, 100);
                }
            });
        });

        $("a.showGif").on("click", () => {
            $("img.gif").fadeToggle();
        });
    });
});