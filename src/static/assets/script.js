var script = $("script[src*=script]");

$(window).on("load", () => {
    $("body").hide().fadeIn("slow");
    // eslint-disable-next-line no-undef
    Swal.fire({
        imageUrl: "/assets/img/logo.svg",
        imageWidth: 140,
        imageHeight: 50,
        title: "Welcome!",
        text: "We'll walk you through this step-by-step. This will only take a few seconds.",
        allowOutsideClick: false,
        showClass: {
            popup: "animated fadeInUp fast"
        },
        hideClass: {
            popup: "animated fadeOutDown faster",
        }
    }).then(() => {
        // eslint-disable-next-line no-undef
        Swal.fire({
            title: "Link your Discord",
            html: "This is needed to fetch important data from your profile.<br><i>Notice: This will add you to a guild, where the bot can read your profile.</i>",
            footer: "<img class='gif' src='/assets/img/activities.gif'/><a class='showGif'>How?</a>",
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
            // eslint-disable-next-line no-undef
            Swal.fire({
                title: "Waiting for authorization..",
                showConfirmButton: false,
                allowOutsideClick: false,
                didOpen: () => {
                    var checkPopup = setInterval(() => {
                        if(discordPopup.closed) {
                            clearInterval(checkPopup);
                            // eslint-disable-next-line no-undef
                            Swal.fire({
                                icon: "success",
                                title: "Discord Linked",
                                html: "Beatmap requests are now enabled.<br>Make sure to read #info in the < nzxl.space > Guild that you've been added to.<br>If you don't see the Guild in your list, then that probably means that you've reached the 100-Server limit. Try again! 😎",
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